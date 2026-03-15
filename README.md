# agent.json

The open capability manifest for the agent internet.

`agent.json` is a machine-readable file that a service publishes to declare what it offers to AI agents — its capabilities, inputs, and payment terms.

Just as `robots.txt` tells search engines how to crawl a site, and `.well-known/apple-app-site-association` links websites to mobile apps, `agent.json` tells AI agents exactly how to interact with your service. It replaces the need for agents to blindly scrape pages or guess API endpoints.

## Why does this exist?

The web is evolving from only an internet of human users to a three-party internet where AI agents can act on behalf of human users. Currently, agents struggle to discover what a website can actually do, how to format requests, and who to pay.

This repository establishes a standardized, decentralized, open protocol to solve this:

- **For Service Providers (Websites, SaaS, Apps):** Make your service "agent-ready" in 5 minutes. Let agents interact with your product and get paid for it — without building and maintaining a custom agent API.
- **For AI Agent Builders (Runtimes):** Stop hardcoding brittle web scrapers or custom tool integrations. Fetch the `agent.json` and dynamically understand a site's capabilities, inputs, and payment terms instantly.

## The Economics

### How value flows

The `agent.json` establishes an economic layer for the agentic web — but it's important to understand how it works.

**The manifest is an open standard. The economics are opt-in.** Any runtime can read your `agent.json` and use your declared intents. Whether a provider pays bounties to attract runtimes, or a runtime pays incentives to reward providers, are independent decisons. Nothing in the protocol forces payment.

So why would a runtime (or a provider) pay?

Because the economics are mutually beneficial. Providers who receive *incentives* from runtimes invest in better structured access — faster APIs, richer data, higher reliability. Runtimes who receive *bounties* from providers are motivated to route their users to those services, increasing the provider's traffic and revenue. The economic layer isn't a tax — it's an open marketplace where both sides benefit from participation.

**The same dynamic drove the web's existing economics.** Search engines don't *have* to share revenue with publishers. Payment gateways don't *have* to share revenue with platforms. They do because the ecosystem is more valuable when value flows to the participants who create it.

### The Three Economic Layers

#### 1. Bounties (Provider → Runtime)

Think of bounties as affiliate marketing or advertising for the agentic web. You, the provider, want agents to bring you paying users. So you declare a bounty:

```json
"bounty": { "type": "cpa", "rate": 2.00, "currency": "USDC" }
```

When an agent successfully completes a task at your service — a purchase, a booking — you (the provider) pay the runtime a `$2.00` bounty to their `payout_address`. This acts as an advertisement — a signal to agent runtimes that routing traffic here is economically rewarded.

#### 2. Compute Efficiency Incentives (Runtime → Provider)

Every agent interaction costs compute — AI inference, browser automation, network round-trips. These costs are real and measurable. When a provider publishes a structured `agent.json` with declared intents, agents can skip the expensive guesswork of navigating a website and go straight to the capability they need.

The difference is significant:

| Integration Level | Typical Cost | Typical Speed |
|------------------|-------------|---------------|
| No manifest (DOM automation) | 5–15 AI calls, 10–30 seconds | Slowest |
| Declared intents (Tier 2) | 2–8 AI calls, 5–15 seconds | Faster |
| Direct API endpoints (Tier 2+) | 0–1 AI calls, 1–3 seconds | Fast |
| Agent-native endpoints (Tier 3) | 0 AI calls, <1 second | Fastest |

A provider with a structured manifest can reduce agent compute costs by 10–100x compared to blind automation. This creates a natural economic incentive: runtimes that charge users for compute have reason to preferentially route to efficient providers. 

A provider can optionally *suggest* an `incentive` in their manifest for providing this structured access:

```json
"incentive": { "type": "cpa", "rate": 0.50, "currency": "USDC" }
```

"Incentive" is standard B2B operational language. This is a purely opt-in economic framework:

1. **Suggesting an incentive is optional.** A provider does not have to include an `incentive` field. A runtime might choose to pay a provider an incentive organically simply because their endpoint delivered excellent compute efficiency.
2. **Runtimes can pay more.** A runtime isn't limited to the suggested rate. If a runtime's algorithm notices a provider offers exceptional privacy, speed, or accuracy, the runtime might choose to pay a higher incentive to ensure that provider stays well-resourced.
3. **Incentives stack.** A runtime might decide to pay an incentive *on top of* a provider's required `price`, simply because the runtime wants to reward and encourage high-quality, privacy-oriented providers in the ecosystem.

The framework creates the conditions where efficiency and quality are visible, measurable, and economically rewarded by the open market.

#### 3. Payment Intents / Prices (User → Provider)

Some intents involve the user paying the provider directly — tips, purchases, subscriptions. These are independent of the bounty system and work regardless of whether the runtime participates in bounties. The `endpoint` field creates a payment flow through any payment rail:

```json
{
  "name": "tip_stripe",
  "description": "Send a tip. Creates a hosted checkout session.",
  "endpoint": "/api/stripe/tip",
  "method": "POST",
  "parameters": {
    "amount": { "type": "number", "required": true, "description": "Tip amount in USD" }
  },
  "returns": {
    "type": "object",
    "properties": {
      "url": { "type": "string", "description": "Checkout URL" }
    }
  }
}
```

Payment intents are **payment-rail agnostic** — fiat gateways, crypto commerce processors, direct wallet transfers. The manifest declares what's possible; your backend handles the settlement. See [the payment intent example](./examples/payment-intent-hosted.json).

#### 4. Paid Access (SaaS / API Pricing)

If your service charges for access — per API call, per unit of usage, or a flat fee — you can declare pricing directly on any intent using the `price` field:

```json
{
  "name": "analyze_document",
  "description": "AI-powered document analysis. Extracts key clauses and generates a summary.",
  "endpoint": "/api/v1/analyze",
  "method": "POST",
  "parameters": {
    "document_url": { "type": "string", "required": true }
  },
  "price": {
    "amount": 0.50,
    "currency": "USD",
    "model": "per_call"
  }
}
```

This tells any agent runtime upfront: "this intent costs $0.50 per call." The runtime can present this cost to the user, factor it into task planning, and obtain approval through its supervision layer before executing.

Here is how the three economic layers interact:

| | `price` | `bounty` | `incentive` |
|--|---------|----------|-------------|
| **Direction** | User → Provider | Provider → Runtime | Runtime → Provider |
| **Purpose** | Gating access / buying goods | Advertising / routing acquisition | Performance / fulfillment reward |
| **Required** | Yes (provider blocks access without it) | No (provider's choice) | No (runtime's choice to honor) |

An intent can have any combination. A SaaS might charge $0.50 per call (`price`), offer a $0.10 advertising bonus to runtimes to bring them traffic (`bounty`), and request no performance bonus (`incentive`).

Supported pricing models:
- **`per_call`** — fixed cost per invocation (default)
- **`per_unit`** — cost scales with a parameter value (e.g., $0.10 × number of images generated)
- **`flat`** — one-time access fee

See [the paid SaaS example](./examples/paid-saas-api.json).

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

| Tier | What you publish | What agents can do | Economics |
|------|------------------|--------------------|-------------|
| **1 — Minimal** | `version` + `origin` + `payout_address` | Interact via web automation. | Pay bounties for routing |
| **2 — Structured** | Add `intents` with descriptions and parameters | Precise capability matching. Better routing. | Pay bounties + receive runtime incentives |
| **2+ — Direct API** | Add `endpoint` and `method` to intents | Agents call your API directly. No browser needed. | Charge users prices + receive runtime incentives |
| **3 — Authenticated** | Add `identity` with cryptographic keys | Signed responses, on-chain settlement, verified provider identity. | All of the above + on-chain settlement |

Start at Tier 1. Add detail as your integration matures. Each tier earns more because each tier provides more value to agents and their users.

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

**Intent fields:** `name`, `description`, `endpoint`, `method`, `parameters`, `returns`, `price`, `bounty`

**Hosting:** `https://{domain}/.well-known/agent.json` (preferred) or `https://{domain}/agent.json` (fallback)

**Discovery:** Agent runtimes fetch the manifest when first interacting with a domain. No registration needed — publishing the file is sufficient.

**Bounty resolution:** Intent-level bounty > Manifest-level bounty > No bounty

See [SPECIFICATION.md](./SPECIFICATION.md) for the complete reference.

## Goals and Governance

The goal of this repository is to establish a decentralized, open standard for agent capability discovery. The protocol is designed so that:

- Any service can participate by publishing a file. No registration, no gatekeeper.
- Any agent runtime can consume it. No single runtime is privileged.
- Multiple payment rails are supported. No single payment provider is required.
- The standard evolves through open contribution, not proprietary control.

We welcome PRs, proposals for standard intents across industries, and open discussion on how to improve the specification.

## Further Reading

If you want to understand the emerging agent internet more, including the research and philosophies underpinning this protocol, please refer to:
[https://arcede.com/papers](https://arcede.com/papers)

## License

MIT
