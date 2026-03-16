#!/usr/bin/env node

/**
 * agent.json validator
 *
 * Validates an agent.json manifest against the specification.
 *
 * Usage:
 *   npx agent-json-validate https://example.com/.well-known/agent.json
 *   npx agent-json-validate ./path/to/agent.json
 *   cat agent.json | npx agent-json-validate --stdin
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// --- Schema constraints (inlined to avoid runtime dependency on ajv) ---

const VALID_PARAM_TYPES = [
  "string",
  "integer",
  "number",
  "boolean",
  "array",
  "object",
];
const VALID_BOUNTY_TYPES = ["cpa"];
const VALID_CURRENCIES = ["USDC"];
const INTENT_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const ORIGIN_PATTERN =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

// --- Validation ---

function validate(manifest, sourceUrl) {
  const errors = [];
  const warnings = [];

  // Root required fields
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    errors.push("Manifest must be a JSON object");
    return { valid: false, errors, warnings };
  }

  // version
  if (!manifest.version) {
    errors.push('Missing required field: "version"');
  } else if (manifest.version !== "1.0") {
    errors.push(`Invalid version: "${manifest.version}". Expected "1.0"`);
  }

  // origin
  if (!manifest.origin) {
    errors.push('Missing required field: "origin"');
  } else if (typeof manifest.origin !== "string") {
    errors.push('"origin" must be a string');
  } else if (!ORIGIN_PATTERN.test(manifest.origin)) {
    errors.push(
      `Invalid origin: "${manifest.origin}". Must be a valid domain name.`
    );
  } else if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      const expectedOrigin = url.hostname;
      if (
        manifest.origin !== expectedOrigin &&
        !expectedOrigin.endsWith("." + manifest.origin)
      ) {
        errors.push(
          `Origin mismatch: manifest says "${manifest.origin}" but served from "${expectedOrigin}"`
        );
      }
    } catch {
      // Can't parse URL, skip origin check
    }
  }

  // payout_address
  if (!manifest.payout_address) {
    errors.push('Missing required field: "payout_address"');
  } else if (typeof manifest.payout_address !== "string") {
    errors.push('"payout_address" must be a string');
  } else if (manifest.payout_address.length === 0) {
    errors.push('"payout_address" must not be empty');
  }

  // display_name (optional)
  if (manifest.display_name !== undefined) {
    if (typeof manifest.display_name !== "string") {
      errors.push('"display_name" must be a string');
    } else if (manifest.display_name.length > 100) {
      warnings.push(
        `"display_name" is ${manifest.display_name.length} characters (recommended max: 100)`
      );
    }
  }

  // description (optional)
  if (manifest.description !== undefined) {
    if (typeof manifest.description !== "string") {
      errors.push('"description" must be a string');
    } else if (manifest.description.length > 500) {
      warnings.push(
        `"description" is ${manifest.description.length} characters (recommended max: 500)`
      );
    }
  }

  if (manifest.extensions !== undefined) {
    if (typeof manifest.extensions !== "object" || manifest.extensions === null || Array.isArray(manifest.extensions)) {
      errors.push('"extensions" must be an object');
    }
  }

  // identity (optional)
  if (manifest.identity !== undefined) {
    validateIdentity(manifest.identity, errors, warnings);
  }

  // bounty (optional, manifest-level)
  if (manifest.bounty !== undefined) {
    validateBounty(manifest.bounty, "manifest-level", errors, warnings);
  }

  // incentive (optional, manifest-level)
  if (manifest.incentive !== undefined) {
    validateIncentive(manifest.incentive, "manifest-level", errors, warnings);
  }

  // intents (optional)
  if (manifest.intents !== undefined) {
    if (!Array.isArray(manifest.intents)) {
      errors.push('"intents" must be an array');
    } else {
      const intentNames = new Set();
      manifest.intents.forEach((intent, i) => {
        validateIntent(intent, i, intentNames, errors, warnings);
      });
    }
  } else {
    warnings.push(
      "No intents declared. This is a Tier 1 (minimal) manifest. Declare intents for better agent routing."
    );
  }

  // Check for unknown top-level fields
  const knownFields = [
    "version",
    "origin",
    "payout_address",
    "display_name",
    "description",
    "extensions",
    "identity",
    "intents",
    "bounty",
    "incentive",
  ];
  for (const key of Object.keys(manifest)) {
    if (!knownFields.includes(key) && !key.startsWith("x-") && !key.startsWith("x_")) {
      warnings.push(`Unknown top-level field: "${key}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    tier: determineTier(manifest),
  };
}

function validateIdentity(identity, errors, warnings) {
  if (typeof identity !== "object" || identity === null) {
    errors.push('"identity" must be an object');
    return;
  }

  if (identity.did !== undefined) {
    if (typeof identity.did !== "string") {
      errors.push('"identity.did" must be a string');
    } else if (!identity.did.startsWith("did:")) {
      errors.push(
        `Invalid DID format: "${identity.did}". Must start with "did:"`
      );
    }
  }

  if (identity.public_key !== undefined) {
    if (typeof identity.public_key !== "string") {
      errors.push('"identity.public_key" must be a string');
    }
  }
}

function validateIntent(intent, index, nameSet, errors, warnings) {
  const prefix = `intents[${index}]`;

  if (typeof intent !== "object" || intent === null) {
    errors.push(`${prefix}: must be an object`);
    return;
  }

  // name
  if (!intent.name) {
    errors.push(`${prefix}: missing required field "name"`);
  } else if (typeof intent.name !== "string") {
    errors.push(`${prefix}: "name" must be a string`);
  } else {
    if (!INTENT_NAME_PATTERN.test(intent.name)) {
      errors.push(
        `${prefix}: intent name "${intent.name}" must be snake_case (lowercase letters, digits, underscores, starting with a letter)`
      );
    }
    if (intent.name.length > 64) {
      errors.push(
        `${prefix}: intent name "${intent.name}" exceeds 64 character limit`
      );
    }
    if (nameSet.has(intent.name)) {
      errors.push(`${prefix}: duplicate intent name "${intent.name}"`);
    }
    nameSet.add(intent.name);
  }

  // description
  if (!intent.description) {
    errors.push(`${prefix}: missing required field "description"`);
  } else if (typeof intent.description !== "string") {
    errors.push(`${prefix}: "description" must be a string`);
  } else {
    if (intent.description.length < 10) {
      warnings.push(
        `${prefix}: description is very short (${intent.description.length} chars). Longer descriptions improve routing accuracy.`
      );
    }
    if (intent.description.length > 500) {
      warnings.push(
        `${prefix}: description is ${intent.description.length} chars (recommended max: 500)`
      );
    }
  }

  // endpoint (optional)
  const VALID_METHODS = ["GET", "POST", "PUT", "DELETE"];
  if (intent.endpoint !== undefined) {
    if (typeof intent.endpoint !== "string") {
      errors.push(`${prefix}: "endpoint" must be a string`);
    } else if (intent.endpoint.length === 0) {
      errors.push(`${prefix}: "endpoint" must not be empty`);
    }
  }

  // method (optional, but required when endpoint is present)
  if (intent.method !== undefined) {
    if (typeof intent.method !== "string") {
      errors.push(`${prefix}: "method" must be a string`);
    } else if (!VALID_METHODS.includes(intent.method)) {
      errors.push(
        `${prefix}: invalid method "${intent.method}". Must be one of: ${VALID_METHODS.join(", ")}`
      );
    }
    if (intent.endpoint === undefined) {
      warnings.push(
        `${prefix}: "method" is set but "endpoint" is missing. Method is only used with direct API intents.`
      );
    }
  } else if (intent.endpoint !== undefined) {
    errors.push(
      `${prefix}: "endpoint" is set but "method" is missing. The public schema requires "method" whenever "endpoint" is declared.`
    );
  }

  if (intent.extensions !== undefined) {
    if (typeof intent.extensions !== "object" || intent.extensions === null || Array.isArray(intent.extensions)) {
      errors.push(`${prefix}: "extensions" must be an object`);
    }
  }

  // parameters (optional)
  if (intent.parameters !== undefined) {
    if (typeof intent.parameters !== "object" || intent.parameters === null) {
      errors.push(`${prefix}: "parameters" must be an object`);
    } else {
      for (const [paramName, param] of Object.entries(intent.parameters)) {
        validateParameter(param, `${prefix}.parameters.${paramName}`, errors, warnings);
      }
    }
  }

  // returns (optional)
  if (intent.returns !== undefined) {
    if (typeof intent.returns !== "object" || intent.returns === null) {
      errors.push(`${prefix}: "returns" must be an object`);
    }
  }

  // price (optional)
  if (intent.price !== undefined) {
    validatePrice(intent.price, `${prefix}.price`, errors, warnings);
  }

  // bounty (optional, intent-level)
  if (intent.bounty !== undefined) {
    validateBounty(intent.bounty, `${prefix}.bounty`, errors, warnings);
  }

  // incentive (optional, intent-level)
  if (intent.incentive !== undefined) {
    validateIncentive(intent.incentive, `${prefix}.incentive`, errors, warnings);
  }

  const knownFields = [
    "name",
    "description",
    "extensions",
    "endpoint",
    "method",
    "parameters",
    "returns",
    "price",
    "bounty",
    "incentive",
  ];
  for (const key of Object.keys(intent)) {
    if (!knownFields.includes(key) && !key.startsWith("x-") && !key.startsWith("x_")) {
      warnings.push(`${prefix}: unknown field "${key}"`);
    }
  }
}

function validatePrice(price, path, errors, warnings) {
  if (typeof price !== "object" || price === null) {
    errors.push(`${path}: must be an object`);
    return;
  }

  if (price.amount === undefined) {
    errors.push(`${path}: missing required field "amount"`);
  } else if (typeof price.amount !== "number" || price.amount < 0) {
    errors.push(`${path}: "amount" must be a non-negative number`);
  }

  const VALID_PRICE_CURRENCIES = ["USD", "USDC"];
  if (!price.currency) {
    errors.push(`${path}: missing required field "currency"`);
  } else if (!VALID_PRICE_CURRENCIES.includes(price.currency)) {
    errors.push(
      `${path}: invalid currency "${price.currency}". Must be one of: ${VALID_PRICE_CURRENCIES.join(", ")}`
    );
  }

  const VALID_PRICE_MODELS = ["per_call", "per_unit", "flat"];
  if (price.model !== undefined) {
    if (!VALID_PRICE_MODELS.includes(price.model)) {
      errors.push(
        `${path}: invalid model "${price.model}". Must be one of: ${VALID_PRICE_MODELS.join(", ")}`
      );
    }
    if (price.model === "per_unit" && !price.unit_param) {
      errors.push(
        `${path}: model is "per_unit" but "unit_param" is not set. Specify which parameter determines the unit count.`
      );
    }
  }

  if (price.unit_param !== undefined && typeof price.unit_param !== "string") {
    errors.push(`${path}: "unit_param" must be a string`);
  }

  if (price.free_tier !== undefined) {
    if (typeof price.free_tier !== "number" || price.free_tier < 0 || !Number.isInteger(price.free_tier)) {
      errors.push(`${path}: "free_tier" must be a non-negative integer`);
    }
  }
}

function validateParameter(param, path, errors, warnings) {
  if (typeof param !== "object" || param === null) {
    errors.push(`${path}: must be an object`);
    return;
  }

  if (!param.type) {
    errors.push(`${path}: missing required field "type"`);
  } else if (!VALID_PARAM_TYPES.includes(param.type)) {
    errors.push(
      `${path}: invalid type "${param.type}". Must be one of: ${VALID_PARAM_TYPES.join(", ")}`
    );
  }

  if (param.required !== undefined && typeof param.required !== "boolean") {
    errors.push(`${path}: "required" must be a boolean`);
  }

  if (param.enum !== undefined) {
    if (!Array.isArray(param.enum) || param.enum.length === 0) {
      errors.push(`${path}: "enum" must be a non-empty array`);
    }
  }
}

function validateBounty(bounty, path, errors, warnings) {
  if (typeof bounty !== "object" || bounty === null) {
    errors.push(`${path}: must be an object`);
    return;
  }

  if (!bounty.type) {
    errors.push(`${path}: missing required field "type"`);
  } else if (!VALID_BOUNTY_TYPES.includes(bounty.type)) {
    errors.push(
      `${path}: invalid bounty type "${bounty.type}". Must be one of: ${VALID_BOUNTY_TYPES.join(", ")}`
    );
  }

  if (bounty.rate === undefined) {
    errors.push(`${path}: missing required field "rate"`);
  } else if (typeof bounty.rate !== "number" || bounty.rate < 0) {
    errors.push(`${path}: "rate" must be a non-negative number`);
  }

  if (!bounty.currency) {
    errors.push(`${path}: missing required field "currency"`);
  } else if (!VALID_CURRENCIES.includes(bounty.currency)) {
    errors.push(
      `${path}: invalid currency "${bounty.currency}". Must be one of: ${VALID_CURRENCIES.join(", ")}`
    );
  }

  if (bounty.splits !== undefined) {
    validateSplits(bounty.splits, `${path}.splits`, errors, warnings);
  }
}

function validateSplits(splits, path, errors, warnings) {
  if (typeof splits !== "object" || splits === null) {
    errors.push(`${path}: must be an object`);
    return;
  }

  const validKeys = ["orchestrator", "platform", "referrer"];
  let sum = 0;

  for (const [key, value] of Object.entries(splits)) {
    if (!validKeys.includes(key)) {
      if (!key.startsWith("x-") && !key.startsWith("x_")) {
        warnings.push(`${path}: unknown split key "${key}"`);
      }
      continue;
    }
    if (typeof value !== "number" || value < 0 || value > 1) {
      errors.push(`${path}.${key}: must be a number between 0 and 1`);
    } else {
      sum += value;
    }
  }

  if (Math.abs(sum - 1.0) > 0.001) {
    errors.push(
      `${path}: splits must sum to 1.0 (currently ${sum.toFixed(3)})`
    );
  }
}

function validateIncentive(incentive, path, errors, warnings) {
  if (typeof incentive !== "object" || incentive === null) {
    errors.push(`${path}: must be an object`);
    return;
  }

  if (!incentive.type) {
    errors.push(`${path}: missing required field "type"`);
  } else if (!VALID_BOUNTY_TYPES.includes(incentive.type)) {
    errors.push(
      `${path}: invalid incentive type "${incentive.type}". Must be one of: ${VALID_BOUNTY_TYPES.join(", ")}`
    );
  }

  if (incentive.rate === undefined) {
    errors.push(`${path}: missing required field "rate"`);
  } else if (typeof incentive.rate !== "number" || incentive.rate < 0) {
    errors.push(`${path}: "rate" must be a non-negative number`);
  }

  if (!incentive.currency) {
    errors.push(`${path}: missing required field "currency"`);
  } else if (!VALID_CURRENCIES.includes(incentive.currency)) {
    errors.push(
      `${path}: invalid currency "${incentive.currency}". Must be one of: ${VALID_CURRENCIES.join(", ")}`
    );
  }
}

function determineTier(manifest) {
  if (manifest.identity && (manifest.identity.did || manifest.identity.public_key)) {
    return 3;
  }
  if (manifest.intents && manifest.intents.length > 0) {
    return 2;
  }
  return 1;
}

// --- Fetching ---

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (location) {
            fetchUrl(location).then(resolve).catch(reject);
            return;
          }
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

async function loadManifest(input) {
  // URL
  if (input.startsWith("http://") || input.startsWith("https://")) {
    const body = await fetchUrl(input);
    return { manifest: JSON.parse(body), sourceUrl: input };
  }

  // Local file
  const resolved = path.resolve(input);
  const content = fs.readFileSync(resolved, "utf-8");
  return { manifest: JSON.parse(content), sourceUrl: null };
}

async function loadFromStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => {
      resolve({ manifest: JSON.parse(data), sourceUrl: null });
    });
  });
}

// --- Output ---

function printResult(result) {
  const tierLabel = `Tier ${result.tier}`;

  if (result.valid) {
    console.log(`\n  ✓ Valid agent.json (${tierLabel})\n`);
  } else {
    console.log(`\n  ✗ Invalid agent.json\n`);
  }

  if (result.errors.length > 0) {
    console.log("  Errors:");
    result.errors.forEach((e) => console.log(`    ✗ ${e}`));
    console.log();
  }

  if (result.warnings.length > 0) {
    console.log("  Warnings:");
    result.warnings.forEach((w) => console.log(`    ⚠ ${w}`));
    console.log();
  }

  if (result.valid && result.warnings.length === 0) {
    console.log("  No issues found.\n");
  }
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
  agent.json validator

  Usage:
    npx agent-json-validate <url-or-path>
    npx agent-json-validate https://example.com/.well-known/agent.json
    npx agent-json-validate ./agent.json
    cat agent.json | npx agent-json-validate --stdin

  Options:
    --stdin     Read manifest from stdin
    --json      Output results as JSON
    --help      Show this help
`);
    process.exit(0);
  }

  const jsonOutput = args.includes("--json");
  const useStdin = args.includes("--stdin");
  const input = args.find((a) => !a.startsWith("--"));

  try {
    const { manifest, sourceUrl } = useStdin
      ? await loadFromStdin()
      : await loadManifest(input);

    const result = validate(manifest, sourceUrl);

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printResult(result);
    }

    process.exit(result.valid ? 0 : 1);
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error("\n  ✗ Invalid JSON:", err.message, "\n");
    } else {
      console.error("\n  ✗ Error:", err.message, "\n");
    }
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { validate };

// Run CLI if invoked directly
if (require.main === module) {
  main();
}
