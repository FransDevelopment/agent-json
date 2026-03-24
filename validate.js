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
  } else if (manifest.version !== "1.0" && manifest.version !== "1.1" && manifest.version !== "1.2" && manifest.version !== "1.3" && manifest.version !== "1.4") {
    errors.push(`Invalid version: "${manifest.version}". Expected "1.0", "1.1", "1.2", "1.3", or "1.4"`);
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

  // x402 (optional, root-level — legacy v1.2)
  if (manifest.x402 !== undefined) {
    validateX402Root(manifest.x402, "x402", errors, warnings);
  }

  // payments (optional, root-level — v1.3+)
  if (manifest.payments !== undefined) {
    validatePayments(manifest.payments, "payments", errors, warnings);
  }

  // Warn if both legacy x402 and payments.x402 are present
  if (manifest.x402 !== undefined && manifest.payments !== undefined && typeof manifest.payments === "object" && manifest.payments !== null && manifest.payments.x402 !== undefined) {
    warnings.push('Both "x402" and "payments.x402" are present. Use "payments.x402" (v1.3) — the legacy top-level "x402" is ignored when "payments" is present.');
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

  // Cross-reference validation: intent network_pricing networks should exist in root x402 config
  // Collect root networks from either legacy x402 or payments.x402
  const rootX402 = (manifest.payments && typeof manifest.payments === "object" && manifest.payments.x402 && typeof manifest.payments.x402 === "object")
    ? manifest.payments.x402
    : (manifest.x402 && typeof manifest.x402 === "object" ? manifest.x402 : null);

  if (rootX402 && manifest.intents && Array.isArray(manifest.intents)) {
    const rootNetworks = new Set();
    if (Array.isArray(rootX402.networks)) {
      rootX402.networks.forEach((entry) => {
        if (entry && typeof entry.network === "string") {
          rootNetworks.add(entry.network);
        }
      });
    } else if (typeof rootX402.network === "string") {
      rootNetworks.add(rootX402.network);
    }

    if (rootNetworks.size > 0) {
      manifest.intents.forEach((intent, i) => {
        // Check legacy intent.x402.network_pricing
        if (intent && intent.x402 && Array.isArray(intent.x402.network_pricing)) {
          intent.x402.network_pricing.forEach((entry, j) => {
            if (entry && typeof entry.network === "string" && !rootNetworks.has(entry.network)) {
              warnings.push(
                `intents[${i}].x402.network_pricing[${j}]: network "${entry.network}" is not declared in the root x402 configuration. Agents will have no settlement details for this network.`
              );
            }
          });
        }
        // Check v1.3 intent.payments.x402.network_pricing
        if (intent && intent.payments && typeof intent.payments === "object" && intent.payments.x402 && Array.isArray(intent.payments.x402.network_pricing)) {
          intent.payments.x402.network_pricing.forEach((entry, j) => {
            if (entry && typeof entry.network === "string" && !rootNetworks.has(entry.network)) {
              warnings.push(
                `intents[${i}].payments.x402.network_pricing[${j}]: network "${entry.network}" is not declared in the root x402 configuration. Agents will have no settlement details for this network.`
              );
            }
          });
        }
      });
    }
  }

  // commitments (optional, v1.4+)
  if (manifest.commitments !== undefined) {
    validateCommitments(manifest.commitments, manifest.identity, errors, warnings);
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
    "x402",
    "payments",
    "commitments",
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

function validateCommitments(commitments, identity, errors, warnings) {
  if (typeof commitments !== "object" || commitments === null || Array.isArray(commitments)) {
    errors.push('"commitments" must be an object');
    return;
  }

  if (!commitments.schema_version) {
    errors.push('"commitments.schema_version" is required');
  } else if (commitments.schema_version !== "1.0") {
    warnings.push(
      `Unknown commitments schema_version: "${commitments.schema_version}". This validator supports "1.0".`
    );
  }

  if (!Array.isArray(commitments.entries)) {
    errors.push('"commitments.entries" must be an array');
    return;
  }

  for (let i = 0; i < commitments.entries.length; i++) {
    const entry = commitments.entries[i];
    const prefix = `commitments.entries[${i}]`;

    if (typeof entry !== "object" || entry === null) {
      errors.push(`${prefix}: must be an object`);
      continue;
    }

    if (!entry.type || typeof entry.type !== "string") {
      errors.push(`${prefix}: missing or invalid "type"`);
    }

    if (!entry.constraint || typeof entry.constraint !== "string") {
      errors.push(`${prefix}: missing or invalid "constraint"`);
    }

    if (entry.verifiable !== undefined && typeof entry.verifiable !== "boolean") {
      errors.push(`${prefix}: "verifiable" must be a boolean`);
    }

    if (entry.ref !== undefined) {
      if (typeof entry.ref !== "string") {
        errors.push(`${prefix}: "ref" must be a string (URL)`);
      } else {
        try {
          new URL(entry.ref);
        } catch {
          errors.push(`${prefix}: "ref" must be a valid URL`);
        }
      }
    }
  }

  if (commitments.signature !== undefined) {
    if (typeof commitments.signature !== "string") {
      errors.push('"commitments.signature" must be a string (base64url Ed25519 signature)');
    } else if (!identity || !identity.public_key) {
      warnings.push(
        '"commitments.signature" is present but no "identity.public_key" to verify against. Signature will be unverifiable.'
      );
    }
  }
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

  if (identity.oatr_issuer_id !== undefined) {
    if (typeof identity.oatr_issuer_id !== "string") {
      errors.push('"identity.oatr_issuer_id" must be a string');
    } else if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(identity.oatr_issuer_id)) {
      errors.push(
        `Invalid OATR issuer ID: "${identity.oatr_issuer_id}". Must be lowercase alphanumeric and hyphens, minimum 2 characters (e.g., "my-runtime").`
      );
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

  // x402 (optional, intent-level — legacy v1.2)
  if (intent.x402 !== undefined) {
    validateX402Intent(intent.x402, `${prefix}.x402`, errors, warnings);
  }

  // payments (optional, intent-level — v1.3+)
  if (intent.payments !== undefined) {
    validatePaymentsIntent(intent.payments, `${prefix}.payments`, errors, warnings);
  }

  // Warn if both legacy x402 and payments.x402 at intent level
  if (intent.x402 !== undefined && intent.payments !== undefined && typeof intent.payments === "object" && intent.payments !== null && intent.payments.x402 !== undefined) {
    warnings.push(`${prefix}: both "x402" and "payments.x402" are present. Use "payments.x402" (v1.3).`);
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
    "x402",
    "payments",
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

  if (price.network !== undefined) {
    if (typeof price.network === "string") {
      // valid — single network
    } else if (Array.isArray(price.network)) {
      if (price.network.length === 0) {
        errors.push(`${path}: "network" array must not be empty`);
      } else if (!price.network.every((n) => typeof n === "string")) {
        errors.push(`${path}: "network" array must contain only strings`);
      } else {
        const seen = new Set();
        for (const n of price.network) {
          if (seen.has(n)) {
            warnings.push(`${path}: duplicate network "${n}" in network array`);
          }
          seen.add(n);
        }
      }
    } else {
      errors.push(`${path}: "network" must be a string or array of strings`);
    }

    if (price.currency === "USD") {
      warnings.push(
        `${path}: "network" is set but currency is "USD". Network is typically used with on-chain currencies like "USDC".`
      );
    }
  }
}

function validateX402Root(x402, path, errors, warnings) {
  if (typeof x402 !== "object" || x402 === null) {
    errors.push(`${path}: must be an object`);
    return;
  }

  if (x402.supported === undefined) {
    errors.push(`${path}: missing required field "supported"`);
  } else if (typeof x402.supported !== "boolean") {
    errors.push(`${path}: "supported" must be a boolean`);
  }

  if (x402.recipient !== undefined && typeof x402.recipient !== "string") {
    errors.push(`${path}: "recipient" must be a string`);
  }

  if (x402.networks !== undefined) {
    // Multi-network mode
    if (!Array.isArray(x402.networks)) {
      errors.push(`${path}: "networks" must be an array`);
    } else if (x402.networks.length === 0) {
      errors.push(`${path}: "networks" array must not be empty`);
    } else {
      const seenNetworks = new Set();
      x402.networks.forEach((entry, i) => {
        const entryPath = `${path}.networks[${i}]`;
        if (typeof entry !== "object" || entry === null) {
          errors.push(`${entryPath}: must be an object`);
          return;
        }
        if (!entry.network || typeof entry.network !== "string") {
          errors.push(`${entryPath}: missing required field "network" (string)`);
        } else {
          if (seenNetworks.has(entry.network)) {
            warnings.push(`${entryPath}: duplicate network "${entry.network}" in networks array`);
          }
          seenNetworks.add(entry.network);
        }
        if (!entry.asset || typeof entry.asset !== "string") {
          errors.push(`${entryPath}: missing required field "asset" (string)`);
        }
        if (entry.contract !== undefined && typeof entry.contract !== "string") {
          errors.push(`${entryPath}: "contract" must be a string`);
        }
        if (entry.facilitator !== undefined && typeof entry.facilitator !== "string") {
          errors.push(`${entryPath}: "facilitator" must be a string`);
        }
      });
    }
  } else {
    // Single-network (flat) mode
    if (x402.network !== undefined && typeof x402.network !== "string") {
      errors.push(`${path}: "network" must be a string`);
    }
    if (x402.asset !== undefined && typeof x402.asset !== "string") {
      errors.push(`${path}: "asset" must be a string`);
    }
    if (x402.contract !== undefined && typeof x402.contract !== "string") {
      errors.push(`${path}: "contract" must be a string`);
    }
    if (x402.facilitator !== undefined && typeof x402.facilitator !== "string") {
      errors.push(`${path}: "facilitator" must be a string`);
    }

    if (x402.supported === true && !x402.network && !x402.asset) {
      warnings.push(
        `${path}: x402 is supported but no network or asset is declared. Agents won't know how to pay.`
      );
    }
  }
}

function validateX402Intent(x402, path, errors, warnings) {
  if (typeof x402 !== "object" || x402 === null) {
    errors.push(`${path}: must be an object`);
    return;
  }

  if (x402.supported !== undefined && typeof x402.supported !== "boolean") {
    errors.push(`${path}: "supported" must be a boolean`);
  }

  if (x402.direct_price !== undefined) {
    if (typeof x402.direct_price !== "number" || x402.direct_price < 0) {
      errors.push(`${path}: "direct_price" must be a non-negative number`);
    }
  }

  if (x402.ticket_price !== undefined) {
    if (typeof x402.ticket_price !== "number" || x402.ticket_price < 0) {
      errors.push(`${path}: "ticket_price" must be a non-negative number`);
    }
  }

  if (x402.description !== undefined && typeof x402.description !== "string") {
    errors.push(`${path}: "description" must be a string`);
  }

  if (
    typeof x402.ticket_price === "number" &&
    typeof x402.direct_price === "number" &&
    x402.ticket_price > x402.direct_price
  ) {
    warnings.push(
      `${path}: "ticket_price" (${x402.ticket_price}) is greater than "direct_price" (${x402.direct_price}). Session tickets are typically discounted.`
    );
  }

  if (x402.network_pricing !== undefined) {
    if (!Array.isArray(x402.network_pricing)) {
      errors.push(`${path}: "network_pricing" must be an array`);
    } else if (x402.network_pricing.length === 0) {
      errors.push(`${path}: "network_pricing" array must not be empty`);
    } else {
      const seenPricingNetworks = new Set();
      x402.network_pricing.forEach((entry, i) => {
        const entryPath = `${path}.network_pricing[${i}]`;
        if (typeof entry !== "object" || entry === null) {
          errors.push(`${entryPath}: must be an object`);
          return;
        }
        if (!entry.network || typeof entry.network !== "string") {
          errors.push(`${entryPath}: missing required field "network" (string)`);
        } else {
          if (seenPricingNetworks.has(entry.network)) {
            warnings.push(`${entryPath}: duplicate network "${entry.network}" in network_pricing array`);
          }
          seenPricingNetworks.add(entry.network);
        }
        if (entry.direct_price !== undefined) {
          if (typeof entry.direct_price !== "number" || entry.direct_price < 0) {
            errors.push(`${entryPath}: "direct_price" must be a non-negative number`);
          }
        }
        if (entry.ticket_price !== undefined) {
          if (typeof entry.ticket_price !== "number" || entry.ticket_price < 0) {
            errors.push(`${entryPath}: "ticket_price" must be a non-negative number`);
          }
        }
        if (
          typeof entry.ticket_price === "number" &&
          typeof entry.direct_price === "number" &&
          entry.ticket_price > entry.direct_price
        ) {
          warnings.push(
            `${entryPath}: "ticket_price" (${entry.ticket_price}) is greater than "direct_price" (${entry.direct_price}). Session tickets are typically discounted.`
          );
        }
      });
    }
  }
}

// --- v1.3 Payments wrapper validation ---

function validatePayments(payments, path, errors, warnings) {
  if (typeof payments !== "object" || payments === null || Array.isArray(payments)) {
    errors.push(`${path}: must be an object`);
    return;
  }

  for (const key of Object.keys(payments)) {
    if (key === "x402") {
      validatePaymentsX402Root(payments.x402, `${path}.x402`, errors, warnings);
    } else if (key === "l402") {
      validateL402Root(payments.l402, `${path}.l402`, errors, warnings);
    } else if (key === "mpp") {
      validateMPPRoot(payments.mpp, `${path}.mpp`, errors, warnings);
    }
    // Unknown protocol keys are allowed (future-proof)
  }
}

function validatePaymentsX402Root(x402, path, errors, warnings) {
  if (typeof x402 !== "object" || x402 === null) {
    errors.push(`${path}: must be an object`);
    return;
  }

  // supported is optional in payments wrapper (presence = supported)
  if (x402.supported !== undefined && typeof x402.supported !== "boolean") {
    errors.push(`${path}: "supported" must be a boolean`);
  }

  if (x402.recipient !== undefined && typeof x402.recipient !== "string") {
    errors.push(`${path}: "recipient" must be a string`);
  }

  // If explicitly set to false, skip network validation
  if (x402.supported === false) {
    return;
  }

  if (x402.networks !== undefined) {
    // Multi-network mode
    if (!Array.isArray(x402.networks)) {
      errors.push(`${path}: "networks" must be an array`);
    } else if (x402.networks.length === 0) {
      errors.push(`${path}: "networks" array must not be empty`);
    } else {
      const seenNetworks = new Set();
      x402.networks.forEach((entry, i) => {
        const entryPath = `${path}.networks[${i}]`;
        if (typeof entry !== "object" || entry === null) {
          errors.push(`${entryPath}: must be an object`);
          return;
        }
        if (!entry.network || typeof entry.network !== "string") {
          errors.push(`${entryPath}: missing required field "network" (string)`);
        } else {
          if (seenNetworks.has(entry.network)) {
            warnings.push(`${entryPath}: duplicate network "${entry.network}" in networks array`);
          }
          seenNetworks.add(entry.network);
        }
        if (!entry.asset || typeof entry.asset !== "string") {
          errors.push(`${entryPath}: missing required field "asset" (string)`);
        }
        if (entry.contract !== undefined && typeof entry.contract !== "string") {
          errors.push(`${entryPath}: "contract" must be a string`);
        }
        if (entry.facilitator !== undefined && typeof entry.facilitator !== "string") {
          errors.push(`${entryPath}: "facilitator" must be a string`);
        }
      });
    }
  } else {
    // Single-network (flat) mode
    if (x402.network !== undefined && typeof x402.network !== "string") {
      errors.push(`${path}: "network" must be a string`);
    }
    if (x402.asset !== undefined && typeof x402.asset !== "string") {
      errors.push(`${path}: "asset" must be a string`);
    }
    if (x402.contract !== undefined && typeof x402.contract !== "string") {
      errors.push(`${path}: "contract" must be a string`);
    }
    if (x402.facilitator !== undefined && typeof x402.facilitator !== "string") {
      errors.push(`${path}: "facilitator" must be a string`);
    }

    if (!x402.network && !x402.asset) {
      warnings.push(
        `${path}: x402 is present but no network or asset is declared. Agents won't know how to pay.`
      );
    }
  }
}

function validateL402Root(l402, path, errors, warnings) {
  if (typeof l402 !== "object" || l402 === null) {
    errors.push(`${path}: must be an object`);
    return;
  }

  if (l402.version !== undefined && typeof l402.version !== "string") {
    errors.push(`${path}: "version" must be a string`);
  }
  if (l402.lightning_address !== undefined && typeof l402.lightning_address !== "string") {
    errors.push(`${path}: "lightning_address" must be a string`);
  }
  if (l402.lnurl !== undefined && typeof l402.lnurl !== "string") {
    errors.push(`${path}: "lnurl" must be a string`);
  }
  if (l402.description !== undefined && typeof l402.description !== "string") {
    errors.push(`${path}: "description" must be a string`);
  }
  if (l402.recipient !== undefined && typeof l402.recipient !== "string") {
    errors.push(`${path}: "recipient" must be a string`);
  }
}

function validateMPPRoot(mpp, path, errors, warnings) {
  if (typeof mpp !== "object" || mpp === null) {
    errors.push(`${path}: must be an object`);
    return;
  }

  if (mpp.stripe_account !== undefined && typeof mpp.stripe_account !== "string") {
    errors.push(`${path}: "stripe_account" must be a string`);
  }
  if (mpp.provider !== undefined && typeof mpp.provider !== "string") {
    errors.push(`${path}: "provider" must be a string`);
  }
  if (mpp.recipient !== undefined && typeof mpp.recipient !== "string") {
    errors.push(`${path}: "recipient" must be a string`);
  }
}

function validatePaymentsIntent(payments, path, errors, warnings) {
  if (typeof payments !== "object" || payments === null || Array.isArray(payments)) {
    errors.push(`${path}: must be an object`);
    return;
  }

  if (payments.x402 !== undefined) {
    validateX402Intent(payments.x402, `${path}.x402`, errors, warnings);
  }

  // l402 and mpp at intent level: basic object validation
  if (payments.l402 !== undefined) {
    if (typeof payments.l402 !== "object" || payments.l402 === null) {
      errors.push(`${path}.l402: must be an object`);
    }
  }
  if (payments.mpp !== undefined) {
    if (typeof payments.mpp !== "object" || payments.mpp === null) {
      errors.push(`${path}.mpp: must be an object`);
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
