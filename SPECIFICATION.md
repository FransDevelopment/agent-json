# agent.json Specification v1.0

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
  "payout_address": "0x1234567890abcdef1234567890abcdef12345678"
}
```

Three fields. Your domain is now discoverable by agent runtimes. Agents interact with your site through standard web automation. Payments accumulate against your payout address.

### Tier 2 — Structured (Declare your capabilities)

```json
{
  "version": "1.0",
  "origin": "example.com",
  "payout_address": "0x1234567890abcdef1234567890abcdef12345678",
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
    "rate": 2.00,
    "currency": "USDC"
  }
}
```

Declares specific capabilities. Agent runtimes match user requests to your declared intents using semantic similarity. More precise routing, higher completion rates, better economics.

### Tier 3 — Authenticated (Cryptographic identity)

Extends Tier 2 with a cryptographic identity for verified provider authentication and on-chain settlement.

```json
{
  "version": "1.0",
  "origin": "example.com",
  "payout_address": "0x1234567890abcdef1234567890abcdef12345678",
  "display_name": "Example Store",
  "description": "Online marketplace for electronics and home goods.",
  "identity": {
    "did": "did:web:example.com",
    "public_key": "base64url-encoded-Ed25519-public-key"
  },
  "intents": [ ... ],
  "bounty": { ... }
}
```

The `identity` block enables:
- Cryptographic verification that the manifest was published by the domain owner
- Signed responses to agent requests (tamper-evident)
- Direct on-chain settlement without intermediary trust

---

## 4. Field Reference

### 4.1 Root Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | **yes** | Manifest schema version. Must be `"1.0"` for this spec. |
| `origin` | string | **yes** | The domain this manifest represents. Must match the domain serving the file. Example: `"example.com"` |
| `payout_address` | string | **yes** | Wallet address for receiving payments. Currently USDC on Base L2. Example: `"0x..."` |
| `display_name` | string | no | Human-readable service name. Used in dashboards and reporting. |
| `description` | string | no | Brief description of the service. Used for semantic discovery when intents aren't declared. |
| `identity` | object | no | Cryptographic identity for Tier 3 integration. See §4.5. |
| `intents` | array | no | Array of `Intent` objects declaring available capabilities. See §4.2. |
| `bounty` | object | no | Default economic terms for all intents. See §4.4. Can be overridden per-intent. |

### 4.2 Intent Object

Each intent represents one capability the service offers to agents.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **yes** | Machine-readable identifier. Must be `snake_case`, unique within the manifest. |
| `description` | string | **yes** | Natural-language description of the capability. This is the primary field used for semantic matching — be specific. |
| `endpoint` | string | no | API endpoint URL for direct execution. Absolute URL or path relative to origin. When present, the runtime calls this endpoint directly instead of using web automation. |
| `method` | string | no | HTTP method for the endpoint. One of `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`. Required when `endpoint` is present. Default: `"POST"`. |
| `parameters` | object | no | Map of parameter names to `Parameter` objects. See §4.3. For `GET` requests, parameters are sent as query strings. For `POST`/`PUT`, as JSON body. |
| `returns` | object | no | Description of the response shape. See §4.3.1. Helps agents understand what to expect without making a call. |
| `bounty` | object | no | Per-intent bounty override. Same schema as root `bounty`. Takes priority over the manifest-level bounty for this intent. |

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
  "name": "tip_hosted_checkout",
  "description": "Send a tip via a hosted payment page. Creates a one-time checkout session. Returns a payment URL the user visits to complete payment.",
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
    "description": "Checkout session",
    "properties": {
      "url": { "type": "string", "description": "Hosted checkout URL for the user to complete payment" },
      "session_id": { "type": "string", "description": "Session identifier for tracking" }
    }
  }
}
```

### 4.4 Bounty Object

Defines the economic terms for completing an intent.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | **yes** | Bounty model. Currently only `"cpa"` (cost per action). |
| `rate` | number | **yes** | Payment amount per successful completion. In the specified currency. |
| `currency` | string | **yes** | Payment currency. Currently `"USDC"`. |
| `splits` | object | no | Revenue distribution. See §4.4.1. |

**Bounty resolution order:** Intent-level bounty → Manifest-level bounty → No bounty (runtime default economics)

#### 4.4.1 Splits Object

Optional revenue distribution among parties.

| Field | Type | Description |
|-------|------|-------------|
| `creator` | number | Provider's share. Range: 0.0–1.0 |
| `platform` | number | Protocol fee. Range: 0.0–1.0 |
| `orchestrator` | number | Executing agent's share. Range: 0.0–1.0 |

All splits must sum to exactly `1.0`.

### 4.5 Identity Object (Tier 3)

Optional cryptographic identity for authenticated provider integration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `did` | string | no | Decentralized Identifier. Example: `"did:web:example.com"` |
| `public_key` | string | no | Base64url-encoded Ed25519 public key for signing verification |

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

- **Be specific:** "Search our catalog of 50,000+ electronics, home goods, and clothing items by keyword, brand, or category. Returns name, price, rating, stock status, and delivery estimate."
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

---

## 8. Versioning

The `version` field uses a simple `"MAJOR.MINOR"` format.

- **Major version** changes (e.g., `"1.0"` → `"2.0"`) indicate breaking changes. Runtimes should handle unknown major versions gracefully (warn, don't crash).
- **Minor version** changes (e.g., `"1.0"` → `"1.1"`) indicate backward-compatible additions. Runtimes should ignore unrecognized fields.

This spec defines version `"1.0"`.

---

## 9. Payment Intents

The agent.json spec distinguishes between two kinds of economic flow:

### 9.1 Bounty Payments (runtime → provider)

The `bounty` field defines payments the **runtime** makes to the **provider** for completing an intent. These are settled through the runtime's settlement layer (typically USDC on Base L2, sent to the `payout_address`). The provider doesn't handle any payment processing — the runtime handles it.

This is the default economic model: the user pays the runtime, the runtime pays the provider.

### 9.2 Payment Intents (user → provider)

Some intents involve a **user-facing payment** — the intent itself creates a payment flow where the user pays the provider directly. Common examples: tipping, purchasing, donating, subscribing.

The pattern:

```
agent.json (declaration)  →  API endpoint (execution)  →  Payment provider (settlement)
  "what can I do?"           "validate & create"          "collect payment"
```

Example — a hosted checkout tipping intent (e.g. Stripe, Coinbase Commerce, PayPal):

```json
{
  "name": "tip_hosted_checkout",
  "description": "Send a tip to this creator. Creates a one-time checkout session. The user completes payment on the provider-hosted page.",
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
    "properties": {
      "url": { "type": "string", "description": "Hosted checkout URL" },
      "session_id": { "type": "string", "description": "Checkout session ID" }
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

### 9.3 Key Differences

| | Bounty Payment | Payment Intent |
|--|----------------|----------------|
| **Who pays** | Runtime (on behalf of user) | User directly |
| **Settlement** | USDC to `payout_address` | Any payment rail (Stripe, crypto, etc.) |
| **Declared via** | `bounty` field | Intent with `endpoint` or `payout_address` |
| **Provider handles payment** | No | Yes (server-side) |
| **Use case** | Rewarding providers for completing tasks | User-facing transactions (purchases, tips, subscriptions) |

Both can coexist in the same manifest. A service can receive bounty payments for search intents (the runtime pays for agent routing) and offer payment intents for purchases (the user pays for goods).

### 9.4 Payment Rail Agnosticism

The spec intentionally does not mandate a specific payment rail for payment intents. The `payout_address` field and bounty system use USDC on Base L2, but payment intents can use any provider:

- **Stripe** — returns a Checkout URL
- **Coinbase Commerce** — returns a hosted payment page URL
- **Direct crypto transfer** — agent reads the wallet address and initiates a transfer
- **PayPal, Square, or any other provider** — as long as the endpoint returns a payment URL or structured response

This is the "competitive marketplace for financial services" described in the agent internet papers. No single payment provider is privileged. The agent.json declares the capability; the provider chooses how to settle.

---

## 10. Security Considerations

- **Origin verification is mandatory.** Runtimes must reject manifests where the `origin` doesn't match the serving domain.
- **HTTPS is mandatory.** Runtimes must not fetch manifests over HTTP.
- **Payout addresses are not validated by the spec.** Runtimes are responsible for verifying that payout addresses are valid for the target settlement network.
- **Intent descriptions are untrusted input.** Runtimes should not execute intent descriptions as code or use them in contexts where injection is possible.
- **Manifests can change.** A provider can modify their manifest at any time. Runtimes should re-fetch periodically and handle changes gracefully (new intents, removed intents, changed bounties).
- **Endpoint URLs must be same-origin.** When an intent declares an `endpoint`, runtimes should verify the endpoint resolves to the same origin as the manifest. A manifest at `example.com` should not declare endpoints at `evil.com`. Relative paths (e.g., `/api/stripe/tip`) are resolved against the manifest's origin.
- **Payment intent URLs are user-facing.** When a payment intent returns a URL (e.g., a Stripe Checkout URL), runtimes should present it to the user through the supervision layer — not navigate to it silently. Payment URLs should trigger the runtime's APPROVE or CONFIRM supervision level.
- **API secrets never appear in the manifest.** The manifest is public. All secrets (Stripe keys, API tokens, signing keys) live server-side in the endpoint implementation. The manifest only declares what's possible, not how it's authenticated internally.

---

## 11. License

This specification is released under the MIT License. Anyone can implement, extend, or build upon it without restriction.
