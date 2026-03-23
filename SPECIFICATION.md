# agent.json Specification v1.3

## The open capability manifest for the agent internet.

---

## 1. Purpose

`agent.json` is a machine-readable manifest that a service publishes to declare what it offers to AI agents. It answers three questions:

1. **What can agents do here?** (intents)
2. **What inputs do those actions require?** (parameters)
3. **Where should payment go?** (payout address and bounty terms)

Any agent runtime can read an `agent.json`. Any service can publish one. The format is open, the schema is public, and no single entity controls the registry or discovery mechanism.

---

## 2. Hosting

Serve your manifest at one of these paths (checked in order):

```
https://yourdomain.com/.well-known/agent.json    (preferred)
https://yourdomain.com/agent.json                 (fallback)
```

**Requirements:**
- Served over HTTPS
- `Content-Type: application/json`
- Publicly accessible without authentication
- Valid JSON
- No redirects to a different origin (same-origin only)

The `.well-known` path follows [RFC 8615](https://www.rfc-editor.org/rfc/rfc8615) conventions.

---

## 3. Integration Tiers

The manifest supports progressive integration. Start minimal, add detail as your integration matures.

### Tier 1 — Minimal (Claim your domain)

```json
{
  "version": "1.0",
  "origin": "example.com",
  "payout_address": "0x0000000000000000000000000000000000000000"
}
```

Three fields. Your domain is now discoverable by agent runtimes. Agents interact with your site through standard web automation. Payments accumulate against your payout address.

### Tier 2 — Structured (Declare your capabilities)

```json
{
  "version": "1.0",
  "origin": "example.com",
  "payout_address": "0x0000000000000000000000000000000000000000",
  "display_name": "Example Store",
  "description": "Online marketplace for electronics and home goods.",
  "intents": [
    {
      "name": "search_products",
      "description": "Search the product catalog by keyword, category, or brand. Returns product names, prices, ratings, and availability.",
      "parameters": {
        "query": {
          "type": "string",
          "required": true,
          "description": "Search query"
        },
        "category": {
          "type": "string",
          "required": false,
          "description": "Product category filter"
        },
        "sort_by": {
          "type": "string",
          "required": false,
          "enum": ["relevance", "price_low", "price_high", "rating"],
          "description": "Sort order for results"
        }
      }
    },
    {
      "name": "get_product_details",
      "description": "Get full details for a specific product including description, specifications, reviews, and pricing history.",
      "parameters": {
        "product_id": {
          "type": "string",
          "required": true,
          "description": "Product identifier"
        }
      }
    },
    {
      "name": "complete_purchase",
      "description": "Complete a purchase for items in the user's cart. Requires prior user approval via the agent runtime's supervision layer.",
      "parameters": {
        "cart_id": {
          "type": "string",
          "required": true,
          "description": "Cart identifier"
        }
      },
      "bounty": {
        "type": "cpa",
        "rate": 12.00,
        "currency": "USDC"
      }
    }
  ],
  "bounty": {
    "type": "cpa",
    "rate": 2.0,
    "currency": "USDC"
  },
  "incentive": {
    "type": "cpa",
    "rate": 0.5,
    "currency": "USDC"
  }
}
```

Declares specific capabilities. Agent runtimes match user requests to your declared intents using semantic similarity. More precise routing, higher completion rates, better economics.

### Tier 3 — Authenticated (Identity Metadata)

Extends Tier 2 with provider identity metadata. Public identity metadata is standardized in v1.0; signing, verification, and runtime-specific trust policies are extension-defined.

```json
{
  "version": "1.0",
  "origin": "example.com",
  "payout_address": "0x0000000000000000000000000000000000000000",
  "display_name": "Example Store",
  "description": "Online marketplace for electronics and home goods.",
  "identity": {
    "did": "did:web:example.com",
    "public_key": "base64url-encoded-public-key"
  },
  "intents": [ ... ],
  "bounty": { ... }
}
```

The `identity` block provides:
- A stable provider identifier for runtimes
- A place to attach public-key material or DID metadata
- A foundation for runtime-specific trust policies or future standardized signing behavior

Manifest signing and verification are **not** standardized in v1.0. Runtimes that support signed manifests should document that behavior through extensions.

---

## 4. Field Reference

### 4.1 Root Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | **yes** | Manifest schema version. `"1.0"`, `"1.1"`, `"1.2"`, or `"1.3"`. |
| `origin` | string | **yes** | The domain this manifest represents. Must match the domain serving the file. Example: `"example.com"` |
| `payout_address` | string | **yes** | Wallet address for receiving payments. Currently USDC on Base L2. Example: `"0x..."` |
| `display_name` | string | no | Human-readable service name. Used in dashboards and reporting. |
| `description` | string | no | Brief description of the service. Used for semantic discovery when intents aren't declared. |
| `extensions` | object | no | Vendor-specific extension namespaces. Recommended shape: `extensions.<vendor>`. Unknown namespaces must be ignored. |
| `identity` | object | no | Provider identity metadata for Tier 3 integration. See §4.7. |
| `intents` | array | no | Array of `Intent` objects declaring available capabilities. See §4.2. |
| `bounty` | object | no | Default economic terms for all intents. See §4.4. Can be overridden per-intent. |
| `incentive` | object | no | Default suggested incentive for all intents. See §4.6. Can be overridden per-intent. |
| `x402` | object | no | x402 payment discovery metadata. See §4.8. Declares support for x402 (HTTP 402) payment negotiation. |
| `payments` | object | no | Payment protocol discovery wrapper. See §4.9. Added in v1.3. |

### 4.2 Intent Object

Each intent represents one capability the service offers to agents.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **yes** | Machine-readable identifier. Must be `snake_case`, unique within the manifest. |
| `description` | string | **yes** | Natural-language description of the capability. This is the primary field used for semantic matching — be specific. |
| `extensions` | object | no | Vendor-specific extension namespaces for this intent. Recommended shape: `extensions.<vendor>`. Unknown namespaces must be ignored. |
| `endpoint` | string | no | API endpoint URL for direct execution. Absolute URL or path relative to origin. When present, the runtime calls this endpoint directly instead of using web automation. |
| `method` | string | no | HTTP method for the endpoint. One of `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`. Publishers should declare it whenever `endpoint` is present. Runtimes may default to `"POST"` for compatibility. |
| `parameters` | object | no | Map of parameter names to `Parameter` objects. See §4.3. For `GET` requests, parameters are sent as query strings. For `POST`/`PUT`, as JSON body. |
| `returns` | object | no | Description of the response shape. See §4.3.1. Helps agents understand what to expect without making a call. |
| `price` | object | no | What the provider charges to access this intent. See §4.5. When present, the runtime must arrange payment before or during execution. |
| `bounty` | object | no | Per-intent bounty override. What the provider pays the runtime for completing this intent. Takes priority over manifest-level bounty. |
| `incentive` | object | no | Per-intent incentive override. What the provider suggests the runtime pay for fulfilling this intent. Takes priority over manifest-level incentive. |
| `x402` | object | no | Per-intent x402 payment metadata. Overrides or extends root-level x402 configuration. See §4.8.2. |
| `payments` | object | no | Per-intent payment protocol overrides. See §4.9.2. Added in v1.3. |

When `endpoint` is present, the intent is a **direct API intent** — the agent runtime calls the endpoint with the declared parameters and receives a structured response. When `endpoint` is absent, the intent is a **semantic intent** — the runtime uses the description for capability matching and executes via web automation or other means.

**Intent naming conventions:**

| Pattern | Example | Use For |
|---------|---------|---------|
| `search_*` | `search_products` | Finding and listing items |
| `get_*` | `get_order_status` | Retrieving specific data |
| `add_*` | `add_to_cart` | Creating or adding |
| `update_*` | `update_profile` | Modifying existing data |
| `delete_*` | `delete_saved_item` | Removing |
| `submit_*` | `submit_application` | Form submissions |
| `complete_*` | `complete_purchase` | Finalizing transactions |

### 4.3 Parameter Object

Each parameter describes one input to an intent.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | **yes** | Data type. One of: `"string"`, `"integer"`, `"number"`, `"boolean"`, `"array"`, `"object"` |
| `required` | boolean | no | Whether the parameter is required. Default: `false` |
| `description` | string | no | Human-readable description of the parameter |
| `enum` | array | no | Exhaustive list of allowed values |
| `default` | any | no | Default value when not provided by the agent |

#### 4.3.1 Returns Object

Optional description of what the intent returns. Helps agents understand the response shape without making a call.

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Top-level response type. One of: `"object"`, `"array"`, `"string"` |
| `properties` | object | For `"object"` type: map of property names to `{ type, description }` |
| `description` | string | Human-readable description of the response |

Example:

```json
{
  "name": "tip_checkout",
  "description": "Send a tip. Creates a one-time checkout session. Returns a payment URL the user visits to complete payment.",
  "endpoint": "/api/checkout/tip",
  "method": "POST",
  "parameters": {
    "amount": {
      "type": "number",
      "required": true,
      "description": "Tip amount in USD (minimum $5)"
    }
  },
  "returns": {
    "type": "object",
    "description": "Hosted checkout session",
    "properties": {
      "url": { "type": "string", "description": "Payment URL for the user to complete payment" },
      "session_id": { "type": "string", "description": "Session identifier for tracking" }
    }
  }
}
```

### 4.4 Bounty Object

Defines what the **provider pays the runtime** for successfully completing an intent. This acts as an advertisement — a signal to agent runtimes that routing traffic here is economically rewarded.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | **yes** | Bounty model. Currently only `"cpa"` (cost per action). |
| `rate` | number | **yes** | Payment amount the provider pays per successful completion. In the specified currency. |
| `currency` | string | **yes** | Payment currency. Currently `"USDC"`. |
| `splits` | object | no | How the payment is distributed among runtime parties. See §4.4.1. |

**Bounty resolution order:** Intent-level bounty → Manifest-level bounty → No bounty

#### 4.4.1 Splits Object

Optional revenue distribution indicating how the provider's bounty should be divided among the parties that facilitated the request.

| Field | Type | Description |
|-------|------|-------------|
| `orchestrator` | number | Executing agent's share. Range: 0.0–1.0 |
| `platform` | number | Protocol or marketplace fee. Range: 0.0–1.0 |
| `referrer` | number | Referring agent or discovery layer share. Range: 0.0–1.0 |

All splits must sum to exactly `1.0`.

### 4.5 Price Object

Optional pricing that the provider charges for accessing an intent. Price is what the provider *charges* the user/runtime (required for access). This is different from `bounty`, which is what the provider *pays* the runtime (advertisement), and `incentive`, which is what the runtime optimally pays the provider (performance bonus).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | **yes** | Cost per call in the specified currency. |
| `currency` | string | **yes** | Currency. `"USD"` for fiat pricing, `"USDC"` for on-chain pricing. |
| `model` | string | no | Pricing model. `"per_call"` (default), `"per_unit"` (amount × a parameter value), or `"flat"` (one-time access fee). |
| `unit_param` | string | no | For `per_unit` model: which parameter determines the unit count. Example: `"tokens"` for an LLM API. |
| `free_tier` | number | no | Number of free calls before pricing applies. Useful for trial access. |
| `network` | string \| string[] | no | Settlement network(s) for on-chain currencies. A single string (e.g., `"base"`) or array of strings (e.g., `["base", "arbitrum"]`). Omit for fiat currencies. When present, agents can verify they are paying on the correct network before initiating a transaction. |

**How the three economic layers interact:**

- **Price:** Provider charges user/runtime for access. (Required)
- **Bounty:** Provider pays runtime for routing traffic. (Optional advertisement)
- **Incentive:** Runtime optimally pays provider for fulfillment. (Optional routing preference)

An intent can have any combination of these three fields. For example, a SaaS API might charge a `$0.50` price to the user, offer a `$0.10` bounty to the runtime to encourage routing, and request no incentive.

**Example — a paid SaaS API:**

```json
{
  "name": "analyze_document",
  "description": "AI-powered document analysis. Extracts key clauses, identifies risks, and generates a summary.",
  "endpoint": "/api/v1/analyze",
  "method": "POST",
  "parameters": {
    "document_url": { "type": "string", "required": true, "description": "URL of the document to analyze" },
    "analysis_type": { "type": "string", "required": false, "enum": ["summary", "risk", "full"], "default": "full" }
  },
  "price": {
    "amount": 0.50,
    "currency": "USD",
    "model": "per_call"
  }
}
```

**Example — usage-based pricing:**

```json
{
  "name": "generate_images",
  "description": "Generate images from text descriptions. Higher count costs proportionally more.",
  "endpoint": "/api/v1/generate",
  "method": "POST",
  "parameters": {
    "prompt": { "type": "string", "required": true },
    "count": { "type": "integer", "required": false, "default": 1, "description": "Number of images to generate (1-10)" }
  },
  "price": {
    "amount": 0.10,
    "currency": "USD",
    "model": "per_unit",
    "unit_param": "count"
  }
}
```

**Payment mechanism:** The spec declares the price but does not prescribe how payment is collected. Providers may:
- Return HTTP 402 with payment instructions when an unpaid request arrives
- Accept runtime credit receipts or attestations of pre-payment
- Require a subscription (via a separate payment intent) that grants access
- Accept direct USDC transfers to the `payout_address`

The runtime is responsible for presenting the cost to the user before executing a priced intent and obtaining appropriate approval through the supervision layer.

### 4.6 Incentive Object

Optional suggested performance incentive. This specifies what the provider suggests a runtime optimally pay them for successfully fulfilling the intent. 

This is standard B2B operational language. It implies optional encouragement rather than contractual obligation, and does not carry the regulatory weight of a "commission" or "fee." 

**Important:** The `incentive` field is merely a *suggestion*. 
- A provider does not need to specify an incentive to receive one.
- Runtimes can decide independently to pay an incentive to a provider (organically) for delivering high compute efficiency.
- Runtimes can choose to pay an incentive *higher* than the suggested rate (e.g., to reward exceptional privacy or speed).
- Runtimes can pay incentives *on top of* a required price.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | **yes** | Incentive model. Currently only `"cpa"` (cost per action). |
| `rate` | number | **yes** | Suggested incentive amount. |
| `currency` | string | **yes** | Incentive currency. Currently `"USDC"`. |

### 4.7 Identity Object (Tier 3)

Optional provider identity metadata for authenticated provider integration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `did` | string | no | Decentralized Identifier. Example: `"did:web:example.com"` |
| `public_key` | string | no | Base64url-encoded public key material advertised by the provider |

### 4.8 x402 Object

Optional payment discovery metadata for the x402 protocol. HTTP 402 (Payment Required) is a standard HTTP status code defined in [RFC 7231](https://www.rfc-editor.org/rfc/rfc7231). The x402 protocol builds on this by defining a structured payment challenge and proof mechanism. The `x402` object enables agents to discover payment capabilities *before* making a request — not after receiving a 402 response.

> **Important:** The x402 field is entirely optional. It does not replace the `price` field, does not prevent other payment mechanisms, and does not make x402 the only supported payment rail. Providers can continue to use any payment method (Stripe, Lightning, direct transfers) with or without x402 support. The `extensions` namespace remains available for other payment rail metadata (e.g., `extensions.stripe`).

> **Note:** For v1.3+, the recommended approach is to use the `payments` wrapper (§4.9) instead of the top-level `x402` field. The top-level `x402` field is retained for v1.2 backward compatibility.

#### 4.8.1 Root-Level x402 Object

Declares that this provider supports x402 payment negotiation. These values serve as defaults for all intents.

**Single-network form (flat fields):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `supported` | boolean | **yes** | Whether the provider accepts x402 payment proofs. |
| `network` | string | no | Settlement network. Example: `"base"`, `"ethereum"`. Used in single-network mode. |
| `asset` | string | no | Payment asset accepted. Example: `"USDC"`, `"ETH"`. Used in single-network mode. |
| `contract` | string | no | Token contract address for ERC-20 assets. Required for non-native assets in single-network mode. |
| `facilitator` | string | no | URL of the x402 facilitator service used for payment verification. |
| `recipient` | string | no | Recipient address for x402 payments. Defaults to the manifest's `payout_address` if omitted. |

**Multi-network form (`networks` array):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `supported` | boolean | **yes** | Whether the provider accepts x402 payment proofs. |
| `networks` | array | no | Array of network configuration objects. When present, flat fields (`network`, `asset`, `contract`, `facilitator`) are ignored. |
| `recipient` | string | no | Recipient address for x402 payments. Defaults to the manifest's `payout_address` if omitted. |

**Network configuration object** (each entry in `networks`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `network` | string | **yes** | Blockchain network identifier. Examples: `"base"`, `"ethereum"`, `"arbitrum"`. |
| `asset` | string | **yes** | Payment asset accepted on this network. Examples: `"USDC"`, `"ETH"`. |
| `contract` | string | no | Token contract address for ERC-20 assets on this network. |
| `facilitator` | string | no | URL of the x402 facilitator service for this network. |

**Resolution:** If `networks` is present, it takes priority and flat fields are ignored. This allows single-network providers to use the simpler flat form while multi-network providers use the `networks` array.

**Example — single network (flat):**

```json
{
  "x402": {
    "supported": true,
    "network": "base",
    "asset": "USDC",
    "contract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "facilitator": "https://x402.org/facilitator"
  }
}
```

**Example — multi-network:**

```json
{
  "x402": {
    "supported": true,
    "networks": [
      {
        "network": "base",
        "asset": "USDC",
        "contract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "facilitator": "https://x402.org/facilitator"
      },
      {
        "network": "arbitrum",
        "asset": "USDC",
        "contract": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        "facilitator": "https://x402.org/facilitator"
      }
    ]
  }
}
```

#### 4.8.2 Intent-Level x402 Override

Per-intent x402 metadata. When present, overrides or extends the root-level x402 configuration for that specific intent.

| Field | Type | Description |
|-------|------|-------------|
| `supported` | boolean | Override the root-level `supported` flag for this intent. |
| `direct_price` | number | Price per request when paying directly via x402 (no session ticket). Applies to all networks unless overridden by `network_pricing`. |
| `ticket_price` | number | Discounted price per request when using a prepaid session ticket. Applies to all networks unless overridden by `network_pricing`. |
| `description` | string | Human-readable explanation of x402 pricing for this intent. |
| `network_pricing` | array | Per-network price overrides. Only needed when costs genuinely differ across chains. |

**Network pricing object** (each entry in `network_pricing`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `network` | string | **yes** | Blockchain network this pricing applies to. |
| `direct_price` | number | no | Network-specific direct price. Overrides the intent's top-level `direct_price`. |
| `ticket_price` | number | no | Network-specific ticket price. Overrides the intent's top-level `ticket_price`. |

**Resolution order for intent x402 pricing:** `network_pricing[matching_network]` → intent-level `direct_price`/`ticket_price` → `price.amount`

**Example — single price for all networks:**

```json
{
  "x402": {
    "direct_price": 0.50,
    "ticket_price": 0.40,
    "description": "Pay $0.50/request directly via x402, or $0.40 with a Session Ticket."
  }
}
```

**Example — per-network overrides:**

```json
{
  "x402": {
    "direct_price": 0.50,
    "ticket_price": 0.40,
    "network_pricing": [
      { "network": "ethereum", "direct_price": 0.55, "ticket_price": 0.45 }
    ]
  }
}
```

In this example, Base and Arbitrum use the default $0.50/$0.40 pricing, while Ethereum costs $0.55/$0.45 due to higher gas costs.

#### 4.8.3 x402 Resolution Order

Intent-level `x402` → Root-level `x402` → No x402

If an intent declares `x402`, its values take priority. If an intent has no `x402` but the root does, the root values apply. If neither declares `x402`, the provider does not support x402 payment discovery (but may still return 402 responses at runtime).

#### 4.8.4 How x402 Interacts With Other Fields

- **`price`** remains the canonical cost declaration. `x402` adds discovery metadata about *how* to pay, not *what* it costs.
- **`bounty`** and **`incentive`** are unaffected. They describe provider-to-runtime and runtime-to-provider flows, which are independent of user-to-provider payment.
- **`payout_address`** is used as the default x402 recipient unless `x402.recipient` overrides it.
- **`extensions`** remains available for non-x402 payment rails (e.g., `extensions.stripe`, `extensions.lightning`).

### 4.9 Payments Object (v1.3+)

The `payments` object is a protocol-agnostic wrapper for payment discovery. Each key is a protocol name, and the presence of a key means the protocol is supported. This design allows providers to advertise multiple payment rails simultaneously and enables new payment protocols to be added without spec changes.

> **Important:** The `payments` object replaces the top-level `x402` field from v1.2. Runtimes encountering v1.3 manifests should read payment configuration from `payments`. The legacy top-level `x402` field is still accepted for backward compatibility but is ignored when `payments` is present.

#### 4.9.1 Root-Level Payments Object

| Field | Type | Description |
|-------|------|-------------|
| `x402` | object | x402 (HTTP 402) payment configuration. See §4.8.1 for field details. In the payments wrapper, the `supported` field is not required — presence of the key means x402 is supported. |
| `l402` | object | L402 (Lightning Network) payment configuration. See below. |
| `mpp` | object | Managed Payment Provider configuration. See below. |
| *(any key)* | object | Unknown protocol keys are allowed. Runtimes should ignore unrecognized protocols. |

**Protocol discovery:**

```typescript
const protocols = Object.keys(manifest.payments || {});
// → ["x402", "l402", "mpp"]
```

**x402 within payments:**

Same fields as the legacy root-level x402 (§4.8.1) — `networks`, `network`, `asset`, `contract`, `facilitator`, `recipient` — but the `supported` field is no longer required. Presence under `payments` means the protocol is supported. To explicitly advertise awareness without support, set `supported: false`.

**Example — multi-protocol payment discovery:**

```json
{
  "payments": {
    "x402": {
      "networks": [
        {
          "network": "base",
          "asset": "USDC",
          "contract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "facilitator": "https://x402.org/facilitator"
        }
      ],
      "recipient": "0xYOUR_ADDRESS"
    },
    "l402": {
      "lightning_address": "api@example.com"
    },
    "mpp": {
      "stripe_account": "acct_1234567890",
      "provider": "stripe"
    }
  }
}
```

**L402 Object:**

| Field | Type | Description |
|-------|------|-------------|
| `lightning_address` | string | Lightning address for receiving payments (e.g., `api@example.com`). |
| `lnurl` | string | LNURL endpoint for Lightning payment negotiation. |
| `recipient` | string | Override recipient. Defaults to the manifest's `payout_address`. |

**MPP (Managed Payment Provider) Object:**

| Field | Type | Description |
|-------|------|-------------|
| `stripe_account` | string | Stripe Connect account ID (e.g., `acct_...`). |
| `provider` | string | Payment provider identifier (e.g., `stripe`, `square`, `adyen`). |
| `recipient` | string | Override recipient. Defaults to the manifest's `payout_address`. |

**Payout address resolution:**

For any payment protocol, the recipient is resolved as:
1. `payments.{protocol}.recipient` (if set)
2. `payout_address` (manifest-level default)

#### 4.9.2 Intent-Level Payments Object

Each intent can override payment configuration per protocol using `payments` at the intent level. The structure mirrors the root-level `payments` object.

For x402, intent-level overrides use the same fields as §4.8.2 (`direct_price`, `ticket_price`, `description`, `network_pricing`).

**Example:**

```json
{
  "name": "analyze_document",
  "description": "AI-powered document analysis.",
  "price": { "amount": 0.50, "currency": "USDC", "network": ["base"] },
  "payments": {
    "x402": {
      "direct_price": 0.50,
      "ticket_price": 0.40,
      "network_pricing": [
        { "network": "ethereum", "direct_price": 0.55, "ticket_price": 0.45 }
      ]
    }
  }
}
```

#### 4.9.3 Payments Resolution Order

Intent-level `payments[protocol]` → Root-level `payments[protocol]` → No protocol support

For x402 pricing within `payments`:
`intent.payments.x402.network_pricing[matching_network]` → `intent.payments.x402.direct_price/ticket_price` → `price.amount`

#### 4.9.4 Backward Compatibility

- **v1.2 manifests** with top-level `x402` remain valid. Runtimes should check `payments.x402` first, then fall back to top-level `x402`.
- **v1.2 intent-level** `x402` also remains valid. Runtimes should check `intent.payments.x402` first, then fall back to `intent.x402`.
- If both `x402` and `payments.x402` are present, `payments.x402` takes precedence.

---

## 5. Discovery

### 5.1 How Runtimes Discover Manifests

When an agent first interacts with a domain, the runtime checks for an `agent.json`:

1. Fetch `https://{origin}/.well-known/agent.json`
2. If not found (404), fetch `https://{origin}/agent.json`
3. If found, parse and validate against this spec
4. Cache the manifest with a runtime-determined TTL (recommended: 1 hour)
5. Re-fetch periodically to pick up changes

No registration is required. Publishing the file is sufficient for discovery.

### 5.2 Origin Verification

The `origin` field in the manifest MUST match the domain serving the file. A manifest at `https://example.com/.well-known/agent.json` must have `"origin": "example.com"`. Runtimes must reject manifests where the origin doesn't match.

This prevents a malicious site from claiming to be a different provider.

### 5.3 Caching

Runtimes should cache manifests to avoid per-request fetches. Recommended behavior:
- Cache for 1 hour minimum
- Respect `Cache-Control` headers if present
- Re-validate on cache expiry
- Serve stale on fetch failure (with warning)

---

## 6. Writing Good Intent Descriptions

The `description` field is the most important field in the manifest. Agent runtimes use it for semantic matching — comparing user requests against declared intents to find the best match.

### Do

- **Be specific:** "Search our catalog of 50,000+ electronics, home goods, and clothing items by keyword, brand, or category. Returns name, price, rating, stock status, and estimated delivery estimate."
- **Describe the output:** "Returns the top 20 matching products with thumbnail images, prices, and average ratings."
- **Include scope boundaries:** "Searches only in-stock items from US warehouses. Does not include marketplace seller listings."
- **Use natural language:** Write as if explaining the capability to a colleague.

### Don't

- **Be vague:** "Search products" — which products? What's returned? What can be filtered?
- **Use internal jargon:** "Queries the PDP via the catalog microservice" — agents don't know your architecture.
- **Duplicate the name:** "search_products: Searches products" — the description should add information the name doesn't convey.

---

## 7. Industry Examples

### E-Commerce

```json
{
  "version": "1.0",
  "origin": "shop.example.com",
  "payout_address": "0x...",
  "display_name": "Example Shop",
  "description": "Online marketplace for electronics, home goods, and clothing with same-day delivery.",
  "intents": [
    {
      "name": "search_products",
      "description": "Search the product catalog by keyword, category, or brand. Returns product name, price, rating, stock status, and estimated delivery date. Supports filtering by price range and minimum rating.",
      "parameters": {
        "query": { "type": "string", "required": true, "description": "Search keywords" },
        "category": { "type": "string", "required": false, "enum": ["electronics", "home", "clothing"] },
        "max_price": { "type": "number", "required": false, "description": "Maximum price in USD" },
        "min_rating": { "type": "number", "required": false, "description": "Minimum star rating (1-5)" }
      }
    },
    {
      "name": "add_to_cart",
      "description": "Add a product to the user's shopping cart by product ID. Returns updated cart contents and total.",
      "parameters": {
        "product_id": { "type": "string", "required": true },
        "quantity": { "type": "integer", "required": false, "default": 1 }
      }
    },
    {
      "name": "complete_purchase",
      "description": "Finalize the purchase of all items in the cart. Requires agent runtime supervision approval. Returns order confirmation number and estimated delivery date.",
      "parameters": {
        "cart_id": { "type": "string", "required": true }
      },
      "bounty": { "type": "cpa", "rate": 15.00, "currency": "USDC" }
    }
  ],
  "bounty": { "type": "cpa", "rate": 1.00, "currency": "USDC" }
}
```

### SaaS / Productivity

```json
{
  "version": "1.0",
  "origin": "app.example.com",
  "payout_address": "0x...",
  "display_name": "Example Docs",
  "description": "Collaborative document editing platform with real-time co-editing, version history, and PDF export.",
  "intents": [
    {
      "name": "create_document",
      "description": "Create a new blank document or from a template. Returns document ID and editor URL.",
      "parameters": {
        "title": { "type": "string", "required": true },
        "template": { "type": "string", "required": false, "enum": ["blank", "report", "proposal", "meeting_notes"] }
      }
    },
    {
      "name": "search_documents",
      "description": "Full-text search across the user's documents. Returns matching documents with title, last modified date, and preview snippet.",
      "parameters": {
        "query": { "type": "string", "required": true },
        "max_results": { "type": "integer", "required": false, "default": 10 }
      }
    },
    {
      "name": "export_document",
      "description": "Export a document as PDF, DOCX, or Markdown. Returns a download URL valid for 24 hours.",
      "parameters": {
        "document_id": { "type": "string", "required": true },
        "format": { "type": "string", "required": true, "enum": ["pdf", "docx", "markdown"] }
      }
    }
  ],
  "bounty": { "type": "cpa", "rate": 0.50, "currency": "USDC" }
}
```

### Travel / Booking

```json
{
  "version": "1.0",
  "origin": "travel.example.com",
  "payout_address": "0x...",
  "display_name": "Example Travel",
  "description": "Flight and hotel search with real-time pricing from 500+ airlines and 1M+ properties worldwide.",
  "intents": [
    {
      "name": "search_flights",
      "description": "Search available flights by origin, destination, and dates. Returns flight options with airline, departure/arrival times, stops, and price. Supports one-way and round-trip.",
      "parameters": {
        "origin": { "type": "string", "required": true, "description": "Departure airport code (IATA)" },
        "destination": { "type": "string", "required": true, "description": "Arrival airport code (IATA)" },
        "departure_date": { "type": "string", "required": true, "description": "ISO 8601 date" },
        "return_date": { "type": "string", "required": false, "description": "ISO 8601 date for round-trip" },
        "passengers": { "type": "integer", "required": false, "default": 1 }
      }
    },
    {
      "name": "book_reservation",
      "description": "Book a flight or hotel reservation. Requires agent runtime supervision approval for payment. Returns confirmation number and itinerary.",
      "parameters": {
        "offer_id": { "type": "string", "required": true, "description": "Offer identifier from search results" }
      },
      "bounty": { "type": "cpa", "rate": 25.00, "currency": "USDC" }
    }
  ],
  "bounty": { "type": "cpa", "rate": 2.00, "currency": "USDC" }
}
```

### Paid API with x402 Micropayments (Multi-Network)

```json
{
  "version": "1.3",
  "origin": "api.example.com",
  "payout_address": "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",
  "display_name": "Example Intelligence API",
  "description": "AI-powered document analysis API with per-call micropayments via x402. No account required — pay per request with USDC on Base or Arbitrum.",
  "payments": {
    "x402": {
      "networks": [
        {
          "network": "base",
          "asset": "USDC",
          "contract": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          "facilitator": "https://x402.org/facilitator"
        },
        {
          "network": "arbitrum",
          "asset": "USDC",
          "contract": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
          "facilitator": "https://x402.org/facilitator"
        }
      ]
    }
  },
  "intents": [
    {
      "name": "analyze_document",
      "description": "AI-powered document analysis. Extracts key clauses, identifies risks, and generates a summary.",
      "endpoint": "/api/v1/analyze",
      "method": "POST",
      "parameters": {
        "document_url": { "type": "string", "required": true, "description": "URL of the document to analyze" }
      },
      "price": {
        "amount": 0.50,
        "currency": "USDC",
        "model": "per_call",
        "network": ["base", "arbitrum"]
      },
      "payments": {
        "x402": {
          "direct_price": 0.50,
          "ticket_price": 0.40,
          "description": "Pay $0.50/analysis directly via x402, or $0.40/analysis with a Session Ticket."
        }
      }
    }
  ],
  "bounty": { "type": "cpa", "rate": 0.25, "currency": "USDC" }
}
```

---

## 8. Versioning

The `version` field uses a simple `"MAJOR.MINOR"` format.

- **Major version** changes (e.g., `"1.0"` → `"2.0"`) indicate breaking changes. Runtimes should handle unknown major versions gracefully (warn, don't crash).
- **Minor version** changes (e.g., `"1.0"` → `"1.1"`) indicate backward-compatible additions. Runtimes should ignore unrecognized fields.

This spec defines versions `"1.0"`, `"1.1"`, `"1.2"`, and `"1.3"`. Version `"1.1"` adds the `price.network` field and the `x402` object for payment discovery. Version `"1.2"` extends multi-network support with the `x402.networks` array for multi-chain settlement configuration. Version `"1.3"` introduces the `payments` wrapper for protocol-agnostic payment discovery, with built-in support for x402, L402 (Lightning), and MPP (managed payment providers). All prior manifests remain valid and interoperable.

---

## 9. Economic Flows

The agent.json spec distinguishes between three kinds of economic flow:

### 9.1 Bounties (provider → runtime)

The `bounty` field defines payments the **provider** makes to the **runtime** for successfully completing an intent. This acts as an advertisement — a signal to agent runtimes that routing traffic to this provider is economically rewarded. 

The runtime decides whether resolving user requests to this provider is appropriate, and if completed, the provider owes the runtime the bounty amount.

### 9.2 Incentives (runtime → provider)

The `incentive` field defines suggested payments the **runtime** makes to the **provider** for fulfilling an intent (e.g. for having efficient, high-quality, or privacy-respecting endpoints that save the runtime compute costs or benefit the user).

The provider suggests an incentive rate in the manifest. The runtime evaluates this and decides independently whether to honor it. 

Because it is an open framework:
- Runtimes can organically pay incentives to providers who never requested one.
- Runtimes can pay *more* than the suggested incentive to reward specific traits (e.g., a privacy-focused algorithm rewarding providers who don't log data).
- Runtimes can pay incentives on top of a required `price`.

### 9.3 Prices / Payment Intents (user → provider)

The `price` field (or an intent with a payment `endpoint`) defines what the **user** pays the **provider** directly for access or goods. This is independent of the runtime's economics. The runtime's job is to facilitate the user's payment to the provider.

The pattern for a payment intent:

```
agent.json (declaration)  →  API endpoint (execution)  →  Payment provider (settlement)
  "what can I do?"           "validate & create"          "collect payment"
```

Example — a hosted checkout tipping intent:

```json
{
  "name": "tip_checkout",
  "description": "Send a tip to this creator. Creates a one-time checkout session. The user completes payment on the hosted page.",
  "endpoint": "/api/checkout/tip",
  "method": "POST",
  "parameters": {
    "amount": {
      "type": "number",
      "required": true,
      "description": "Tip amount in USD (minimum $5)"
    }
  },
  "returns": {
    "type": "object",
    "description": "Hosted checkout session",
    "properties": {
      "url": { "type": "string", "description": "Payment URL for the user to complete payment" },
      "session_id": { "type": "string", "description": "Session identifier for tracking" }
    }
  }
}
```

Example — a crypto-native tipping intent:

```json
{
  "name": "tip_crypto",
  "description": "Send a tip directly to the creator's wallet. The payout_address in this manifest is the destination. No API call needed — the agent reads the address and initiates a transfer.",
  "parameters": {
    "amount": {
      "type": "number",
      "required": true,
      "description": "Tip amount in USDC"
    }
  }
}
```

### 9.4 Key Differences

| | Price / Payment Intent | Bounty | Incentive |
|--|----------------|----------------|----------------|
| **Direction** | User → Provider | Provider → Runtime | Runtime → Provider |
| **Purpose** | Gating access / buying goods | Advertising / routing acquisition | Performance / fulfillment reward |
| **Required** | Yes (provider blocks access without it) | No (provider's choice) | No (runtime's choice to honor) |
| **Declared via** | `price` field or `endpoint` | `bounty` field | `incentive` field |
| **Settlement** | Any payment rail (fiat, crypto) | Typically USDC via Smart Contract | Typically USDC via Smart Contract |

All three can coexist in the same manifest. A service can receive user payments for API calls (`price`), offer a routing bounty to agents who bring traffic (`bounty`), and request an operational performance payment from the runtime for efficiency (`incentive`).

### 9.5 Payment Rail Support

The spec supports multiple payment mechanisms:

**First-class support (via `payments` wrapper, §4.9):**
- **x402 (HTTP 402 Payment Required)** — Structured payment challenge and proof via HTTP headers. Agents discover x402 support from the manifest's `payments.x402` field and can pre-compute payment before the first request. See §4.8.
- **L402 (Lightning Network)** — HTTP 402 challenges with macaroon-based authentication and Lightning Network BOLT 11 invoices. Also supports Lightning Address and LNURL for direct payment discovery. See §4.9.1.
- **MPP (Managed Payment Provider)** — Traditional payment processors (Stripe, Square, etc.) for fiat payment collection. See §4.9.1.
- **Direct transfer** — Agents send payment directly to the `payout_address` on the declared `network`.

**Future protocols:**
- The `payments` wrapper is protocol-agnostic. New payment protocols can be added by providers without spec changes — any key under `payments` is valid. Runtimes should ignore unrecognized protocols.

**Extension support:**
- Non-standard payment rails can also be declared via `extensions.<vendor>` (e.g., `extensions.custom_rail`). Runtimes that understand those extensions can use them; runtimes that don't will ignore them.

**Runtime-negotiated:**
- Providers may return HTTP 402 responses with payment instructions at runtime, regardless of whether `x402` is declared in the manifest. The manifest enables *pre-flight* discovery; the HTTP response enables *runtime* negotiation.

The spec does not mandate any specific payment rail. The `price` field declares cost. The payment mechanism is chosen by the provider and negotiated with the runtime. This is the "competitive marketplace for financial services" described in the agent internet papers. No single payment provider is privileged.

---

## 10. Extensibility & Forward Compatibility

The `agent.json` open standard is designed to evolve cleanly and enable runtimes or consortiums to experiment with new metadata without polluting the core manifest schema.

### 10.1 Vendor Extensions

The preferred extension mechanism is an `extensions` object at the root and intent levels.

Recommended shape:

```json
{
  "extensions": {
    "air": {
      "custom_field": true
    }
  }
}
```

Guidance:
- Use a vendor or runtime namespace under `extensions`, such as `extensions.air`.
- Runtimes must ignore unknown extension namespaces.
- Extensions must not be required for a manifest to be considered valid under the core `agent.json` protocol.

Legacy `x-` or `x_` fields may still be tolerated by validators and runtimes for compatibility, but new integrations should prefer `extensions`.

### 10.2 Forward Compatibility

To ensure the ecosystem remains robust across version updates:

- **Runtimes MUST ignore unknown extension namespaces.**
  If a runtime encounters `extensions.<vendor>` that it does not recognize, it must ignore that namespace and continue processing the manifest.

- **Endpoints remain optional.** 
  A core tenet of the protocol is that web automation and structured endpoints can coexist. The `endpoint` property is intentionally optional to preserve the AI agent internet's ability to automate standard HTML interfaces when APIs aren't available.

- **`/.well-known/agent.json` is strictly canonical.**
  Vendor-specific files (e.g., `/.well-known/custom-vendor.json`) should be avoided. All agent capability discovery should map back to the single `agent.json` file. Runtimes may use `x-` extensions inside `agent.json` rather than fragmenting discovery.

---

## 11. Security Considerations

- **Origin verification is mandatory.** Runtimes must reject manifests where the `origin` doesn't match the serving domain.
- **HTTPS is mandatory.** Runtimes must not fetch manifests over HTTP.
- **Payout addresses are not validated by the spec.** Runtimes are responsible for verifying that payout addresses are valid for the target settlement network.
- **Intent descriptions are untrusted input.** Runtimes should not execute intent descriptions as code or use them in contexts where injection is possible.
- **Manifests can change.** A provider can modify their manifest at any time. Runtimes should re-fetch periodically and handle changes gracefully (new intents, removed intents, changed bounties).
- **Endpoint URLs must be same-origin.** When an intent declares an `endpoint`, runtimes should verify the endpoint resolves to the same origin as the manifest. A manifest at `example.com` should not declare endpoints at `evil.com`. Relative paths (e.g., `/api/checkout/tip`) are resolved against the manifest's origin.
- **Payment intent URLs are user-facing.** When a payment intent returns a URL (e.g., a hosted checkout URL), runtimes should present it to the user through the supervision layer — not navigate to it silently. Payment URLs should trigger the runtime's APPROVE or CONFIRM supervision level.
- **API secrets never appear in the manifest.** The manifest is public. All secrets (private keys, API tokens, signing keys) live server-side in the endpoint implementation. The manifest only declares what's possible, not how it's authenticated internally.

---

## 12. License

This specification is released under the MIT License. Anyone can implement, extend, or build upon it without restriction.
