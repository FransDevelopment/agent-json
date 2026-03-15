# agent.json

The open capability manifest for the agent internet.

`agent.json` is a machine-readable file that a service publishes to declare what it offers to AI agents — its capabilities, inputs, and payment terms. 

Just as `robots.txt` tells search engines how to crawl a site, and `.well-known/apple-app-site-association` links websites to mobile apps, `agent.json` tells AI agents exactly how to interact with your service. It replaces the need for agents to blindly scrape pages or guess API endpoints.

## Why does this exist?

The web is evolving from an internet of human users to an internet of AI agents acting on behalf of users. Currently, agents struggle to discover what a website can actually do, how to format requests, and who to pay. 

This repository establishes a standardized, decentralized, open protocol to solve this finding problem:

- **For Service Providers (Websites, SaaS, Apps):** Make your service "agent-ready" in 5 minutes. Let agents interact with your product and get paid for it (via the bounty system) without building and maintaining a custom agent API.
- **For AI Agent Builders (Runtimes):** Stop hardcoding brittle web scrapers or custom tool integrations. Fetch the `agent.json` and dynamically understand a site's capabilities, inputs, and payment terms instantly.

## The Agentic Economic Layer

`agent.json` is not just about API routing; it establishes an economic layer for the agentic web. 

Through the `bounty` system and `payout_address` fields, you declare exactly how much an action pays (e.g., Cost Per Action in USDC) and the wallet address on a settlement network (like Base L2) where you receive funds. Agents do the work, and your service gets paid.

## Quick Start

### 1. Create your manifest

```json
{
  "version": "1.0",
  "origin": "yoursite.com",
  "payout_address": "0xYOUR_BASE_L2_ADDRESS",
  "display_name": "Your Service",
  "description": "What your service does.",
  "intents": [
    {
      "name": "search_products",
      "description": "Search your catalog by keyword. Returns product names, prices, and availability.",
      "parameters": {
        "query": { "type": "string", "required": true }
      }
    }
  ],
  "bounty": {
    "type": "cpa",
    "rate": 2.00,
    "currency": "USDC"
  }
}
```

### 2. Host it

Serve the file at:

```
https://yoursite.com/.well-known/agent.json
```

That's it. Your service is now discoverable by any agent runtime that implements the spec. No single entity controls the registry.

### 3. Validate it

```bash
npx agent-json-validate https://yoursite.com/.well-known/agent.json
```

Or validate a local file:

```bash
npx agent-json-validate ./agent.json
```

## What's in this repo

| File | Description |
|------|-------------|
| [SPECIFICATION.md](./SPECIFICATION.md) | The full spec — schema, field reference, discovery protocol, security considerations |
| [schema.json](./schema.json) | JSON Schema (2020-12) for programmatic validation |
| [validate.js](./validate.js) | Zero-dependency CLI validator and Node.js library |
| [examples/](./examples/) | Example manifests for different industries |

## Integration Tiers

The protocol supports progressive integration. Start minimal, add detail as your integration matures.

| Tier | What you publish | What agents can do |
|------|------------------|--------------------|
| **1 — Minimal** | `version` + `origin` + `payout_address` | Interact via web automation. Payments accumulate. |
| **2 — Structured** | Add `intents` with descriptions and parameters | Precise capability matching. Better routing, higher completion rates. |
| **3 — Authenticated** | Add `identity` with cryptographic keys | Signed responses, on-chain settlement, verified provider identity. |

## Goals and Governance

The goal of this repository is to establish a decentralized, open standard for agent capability discovery. We welcome PRs, proposals for standard `intents` across industries, and open discussion on how to improve the specification.

## Validator

### CLI

```bash
# From URL
npx agent-json-validate https://example.com/.well-known/agent.json

# From file
npx agent-json-validate ./my-manifest.json

# From stdin
cat agent.json | npx agent-json-validate --stdin

# JSON output
npx agent-json-validate ./agent.json --json
```

Exit code `0` = valid, `1` = invalid.

### Programmatic

```javascript
const { validate } = require("agent-json-validate");

const result = validate({
  version: "1.0",
  origin: "example.com",
  payout_address: "0xYOUR_BASE_L2_ADDRESS",
  intents: [
    {
      name: "search_products",
      description: "Search the product catalog by keyword.",
    },
  ],
});

console.log(result.valid); // true
console.log(result.tier); // 2
console.log(result.errors); // []
console.log(result.warnings); // []
```

### JSON Schema

Use `schema.json` with any JSON Schema validator:

```javascript
import Ajv from "ajv";
import schema from "./schema.json";

const ajv = new Ajv();
const isValid = ajv.validate(schema, manifest);
```

## Specification Summary

**Required fields:** `version`, `origin`, `payout_address`

**Optional fields:** `display_name`, `description`, `identity`, `intents`, `bounty`

**Hosting:** `https://{domain}/.well-known/agent.json` (preferred) or `https://{domain}/agent.json` (fallback)

**Discovery:** Agent runtimes fetch the manifest when first interacting with a domain. No registration needed — publishing the file is sufficient.

**Bounty resolution:** Intent-level bounty > Manifest-level bounty > No bounty

See [SPECIFICATION.md](./SPECIFICATION.md) for the complete reference.

## License

MIT
