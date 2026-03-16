#!/usr/bin/env node

/**
 * agent.json test suite
 *
 * Validates all example manifests and runs unit tests against the validator.
 * No external dependencies — uses Node.js built-in assert.
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { validate } = require("./validate");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

// --- Example file validation ---

console.log("\n  Example manifests\n");

const examplesDir = path.join(__dirname, "examples");
const exampleFiles = fs
  .readdirSync(examplesDir)
  .filter((f) => f.endsWith(".json"));

for (const file of exampleFiles) {
  test(`examples/${file} is valid`, () => {
    const content = fs.readFileSync(path.join(examplesDir, file), "utf-8");
    const manifest = JSON.parse(content);
    const result = validate(manifest);
    assert.strictEqual(
      result.valid,
      true,
      `Expected valid but got errors: ${result.errors.join(", ")}`
    );
  });
}

// --- Schema validation ---

console.log("\n  Schema file\n");

test("schema.json is valid JSON", () => {
  const content = fs.readFileSync(path.join(__dirname, "schema.json"), "utf-8");
  JSON.parse(content); // throws on invalid JSON
});

// --- Unit tests: required fields ---

console.log("\n  Required fields\n");

test("rejects empty object", () => {
  const result = validate({});
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length >= 3); // version, origin, payout_address
});

test("accepts minimal Tier 1 manifest", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
  });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.tier, 1);
});

test("rejects invalid version", () => {
  const result = validate({
    version: "2.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("version")));
});

test("rejects missing origin", () => {
  const result = validate({
    version: "1.0",
    payout_address: "0x0000000000000000000000000000000000000000",
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("origin")));
});

test("rejects empty payout_address", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "",
  });
  assert.strictEqual(result.valid, false);
});

// --- Unit tests: intents ---

console.log("\n  Intent validation\n");

test("accepts valid Tier 2 manifest with intents", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "search_products",
        description: "Search the product catalog by keyword, category, or brand.",
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.tier, 2);
});

test("rejects intent without name", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [{ description: "A valid description for this intent." }],
  });
  assert.strictEqual(result.valid, false);
});

test("rejects intent with non-snake_case name", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "SearchProducts",
        description: "Search the product catalog by keyword.",
      },
    ],
  });
  assert.strictEqual(result.valid, false);
});

test("rejects duplicate intent names", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      { name: "search", description: "Search the catalog by keyword." },
      { name: "search", description: "Another search description here." },
    ],
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("duplicate")));
});

// --- Unit tests: endpoint and method ---

console.log("\n  Endpoint and method validation\n");

test("accepts intent with endpoint and method", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "tip_hosted_checkout",
        description: "Send a tip via a hosted payment page for checkout.",
        endpoint: "/api/checkout/tip",
        method: "POST",
      },
    ],
  });
  assert.strictEqual(result.valid, true);
});

test("rejects invalid HTTP method", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "do_thing",
        description: "Does a thing via an invalid HTTP method.",
        endpoint: "/api/thing",
        method: "PATCH",
      },
    ],
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("method")));
});

test("rejects endpoint without method", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "do_thing",
        description: "Does a thing via a direct endpoint but omits the method.",
        endpoint: "/api/thing",
      },
    ],
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("method")));
});

test("warns when method is set without endpoint", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "do_thing",
        description: "Does a thing but has method without endpoint.",
        method: "POST",
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("method")));
});

// --- Unit tests: bounty ---

console.log("\n  Bounty validation\n");

test("accepts valid bounty", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    bounty: { type: "cpa", rate: 2.0, currency: "USDC" },
  });
  assert.strictEqual(result.valid, true);
});

test("rejects invalid bounty currency", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    bounty: { type: "cpa", rate: 2.0, currency: "ETH" },
  });
  assert.strictEqual(result.valid, false);
});

test("rejects splits that don't sum to 1.0", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    bounty: {
      type: "cpa",
      rate: 2.0,
      currency: "USDC",
      splits: { orchestrator: 0.5, platform: 0.1, referrer: 0.1 },
    },
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("splits")));
});

// --- Unit tests: price ---

console.log("\n  Price validation\n");

test("accepts valid price", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        price: { amount: 0.50, currency: "USD", model: "per_call" },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
});

test("rejects invalid price currency", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        price: { amount: 0.50, currency: "EUR", model: "per_call" },
      },
    ],
  });
  assert.strictEqual(result.valid, false);
});

test("rejects per_unit model without unit_param", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        price: { amount: 0.50, currency: "USD", model: "per_unit" },
      },
    ],
  });
  assert.strictEqual(result.valid, false);
});

// --- Unit tests: incentive ---

console.log("\n  Incentive validation\n");

test("accepts valid incentive", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    incentive: { type: "cpa", rate: 0.25, currency: "USDC" },
  });
  assert.strictEqual(result.valid, true);
});

test("rejects invalid incentive currency", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    incentive: { type: "cpa", rate: 0.25, currency: "ETH" },
  });
  assert.strictEqual(result.valid, false);
});

test("accepts intent-level incentive", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document for key clauses.",
        incentive: { type: "cpa", rate: 0.10, currency: "USDC" },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
});

// --- Unit tests: extensibility ---

console.log("\n  Extensibility validation\n");

test("accepts vendor extensions without warnings", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    "x-arcede-reliability": 0.99,
    "x_custom_metadata": "test",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document for key clauses.",
        "x-vendor-strict": true,
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.warnings.length, 0);
});

test("warns on unknown fields that are not vendor extensions", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    unknown_field: true,
    intents: [
      {
        name: "test_intent",
        description: "Test intent",
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.warnings.length, 1);
  assert.ok(result.warnings[0].includes("Unknown top-level field"));
});

test("accepts valid extensions object at root and intent levels", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    extensions: {
      air: { score: 1 }
    },
    intents: [
      {
        name: "test_intent",
        description: "Test intent",
        extensions: {
          air: { custom: true }
        }
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.warnings.length, 0);
});

test("rejects non-object extensions at root level", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    extensions: ["invalid_array"]
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('"extensions" must be an object')));
});

test("rejects non-object extensions at intent level", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "test_intent",
        description: "Test intent",
        extensions: "invalid_string"
      },
    ],
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('"extensions" must be an object')));
});

// --- Unit tests: tier detection ---

console.log("\n  Tier detection\n");

test("detects Tier 1", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
  });
  assert.strictEqual(result.tier, 1);
});

test("detects Tier 2", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "search",
        description: "Search the catalog by keyword or brand.",
      },
    ],
  });
  assert.strictEqual(result.tier, 2);
});

test("detects Tier 3", () => {
  const result = validate({
    version: "1.0",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    identity: { did: "did:web:example.com" },
    intents: [
      {
        name: "search",
        description: "Search the catalog by keyword or brand.",
      },
    ],
  });
  assert.strictEqual(result.tier, 3);
});

// --- Results ---

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
