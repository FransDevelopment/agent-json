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

test("accepts version 1.1", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
  });
  assert.strictEqual(result.valid, true);
});

test("accepts version 1.2", () => {
  const result = validate({
    version: "1.2",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
  });
  assert.strictEqual(result.valid, true);
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

// --- Unit tests: price.network ---

console.log("\n  Price network validation\n");

test("accepts price with network as string", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        price: { amount: 0.01, currency: "USDC", model: "per_call", network: "base" },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
});

test("accepts price with network as array of strings", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        price: { amount: 0.01, currency: "USDC", model: "per_call", network: ["base", "arbitrum"] },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
});

test("rejects price with network as number", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        price: { amount: 0.01, currency: "USDC", network: 123 },
      },
    ],
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("network")));
});

test("rejects price with network as empty array", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        price: { amount: 0.01, currency: "USDC", network: [] },
      },
    ],
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("network")));
});

test("warns on duplicate networks in price.network array", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        price: { amount: 0.01, currency: "USDC", network: ["base", "base"] },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("duplicate") && w.includes("base")));
});

test("warns when fiat currency has network set", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        price: { amount: 0.50, currency: "USD", network: "base" },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("network") && w.includes("USD")));
});

// --- Unit tests: x402 root-level ---

console.log("\n  x402 root-level validation\n");

test("accepts valid x402 with flat fields (single network)", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
      network: "base",
      asset: "USDC",
      contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      facilitator: "https://x402.org/facilitator",
    },
  });
  assert.strictEqual(result.valid, true);
});

test("accepts valid x402 with networks array (multi-network)", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
      networks: [
        { network: "base", asset: "USDC", contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
        { network: "arbitrum", asset: "USDC", contract: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
      ],
    },
  });
  assert.strictEqual(result.valid, true);
});

test("rejects x402 missing supported field", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      network: "base",
      asset: "USDC",
    },
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("supported")));
});

test("rejects x402 with supported as non-boolean", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: "yes",
      network: "base",
      asset: "USDC",
    },
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("supported") && e.includes("boolean")));
});

test("rejects networks entry missing required network field", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
      networks: [
        { asset: "USDC", contract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
      ],
    },
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("network")));
});

test("rejects networks entry missing required asset field", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
      networks: [
        { network: "base" },
      ],
    },
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("asset")));
});

test("accepts x402 with recipient override", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
      network: "base",
      asset: "USDC",
      recipient: "0x1111111111111111111111111111111111111111",
    },
  });
  assert.strictEqual(result.valid, true);
});

test("rejects x402 as non-object", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: "not-an-object",
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("x402") && e.includes("object")));
});

test("rejects x402 with empty networks array", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
      networks: [],
    },
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("networks") && e.includes("empty")));
});

test("accepts x402 with supported false and no network info (no warning)", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: false,
    },
  });
  assert.strictEqual(result.valid, true);
  assert.ok(!result.warnings.some((w) => w.includes("x402")));
});

test("warns on duplicate networks in x402.networks array", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
      networks: [
        { network: "base", asset: "USDC" },
        { network: "base", asset: "USDC" },
      ],
    },
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("duplicate") && w.includes("base")));
});

test("warns when x402 supported but no network info provided", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
    },
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("x402") && w.includes("network")));
});

// --- Unit tests: x402 intent-level ---

console.log("\n  x402 intent-level validation\n");

test("rejects intent x402 as non-object", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: "not-an-object",
      },
    ],
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("x402") && e.includes("object")));
});

test("accepts valid intent-level x402", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: {
          direct_price: 0.50,
          ticket_price: 0.40,
          description: "Pay $0.50 directly or $0.40 with a session ticket.",
        },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
});

test("rejects intent x402 with negative direct_price", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: { direct_price: -1 },
      },
    ],
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("direct_price")));
});

test("rejects intent x402 with negative ticket_price", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: { ticket_price: -1 },
      },
    ],
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("ticket_price")));
});

test("warns when ticket_price > direct_price", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: { direct_price: 0.50, ticket_price: 0.60 },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("ticket_price")));
});

test("accepts intent x402 with network_pricing array", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: {
          direct_price: 0.50,
          ticket_price: 0.40,
          network_pricing: [
            { network: "ethereum", direct_price: 0.55, ticket_price: 0.45 },
          ],
        },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
});

test("rejects network_pricing entry missing network", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: {
          direct_price: 0.50,
          network_pricing: [
            { direct_price: 0.55 },
          ],
        },
      },
    ],
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("network")));
});

test("warns on duplicate networks in network_pricing array", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: {
          direct_price: 0.50,
          network_pricing: [
            { network: "ethereum", direct_price: 0.55 },
            { network: "ethereum", direct_price: 0.60 },
          ],
        },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("duplicate") && w.includes("ethereum")));
});

test("warns when network_pricing references network not in root x402", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
      networks: [
        { network: "base", asset: "USDC" },
      ],
    },
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: {
          direct_price: 0.50,
          network_pricing: [
            { network: "ethereum", direct_price: 0.55 },
          ],
        },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("ethereum") && w.includes("not declared")));
});

test("no cross-ref warning when network_pricing matches root x402 networks", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
      networks: [
        { network: "base", asset: "USDC" },
        { network: "ethereum", asset: "USDC" },
      ],
    },
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: {
          direct_price: 0.50,
          network_pricing: [
            { network: "ethereum", direct_price: 0.55 },
          ],
        },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.ok(!result.warnings.some((w) => w.includes("not declared")));
});

test("cross-ref works with flat x402 network field", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    x402: {
      supported: true,
      network: "base",
      asset: "USDC",
    },
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: {
          direct_price: 0.50,
          network_pricing: [
            { network: "arbitrum", direct_price: 0.55 },
          ],
        },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("arbitrum") && w.includes("not declared")));
});

test("warns when network_pricing entry has ticket_price > direct_price", () => {
  const result = validate({
    version: "1.1",
    origin: "example.com",
    payout_address: "0x0000000000000000000000000000000000000000",
    intents: [
      {
        name: "analyze",
        description: "Analyze a document.",
        x402: {
          direct_price: 0.50,
          ticket_price: 0.40,
          network_pricing: [
            { network: "ethereum", direct_price: 0.50, ticket_price: 0.60 },
          ],
        },
      },
    ],
  });
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes("network_pricing") && w.includes("ticket_price")));
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
