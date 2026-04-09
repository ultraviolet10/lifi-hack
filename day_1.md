# Day 1 (Apr 9): Foundation — Monorepo + Worker + Claude Agent

## Exit Criteria

`curl POST /api/chat` with "What's the best USDC vault?" → Claude calls `discover_vaults` tool → worker queries cached Earn API → Claude responds with named vault + APY + risk tier → AND can build a Composer quote returning `transactionRequest`. Full agent loop + deposit tx building working via curl.

---

## Step 1: Restructure Monorepo

- [ ] Rename `packages/utils` → `packages/shared`, update `name` in package.json
- [ ] Rename `apps/website` → `apps/web`, update `name` in package.json
- [ ] Update root `package.json` dev script: `website#dev` → `web#dev`
- [ ] Create `packages/worker/` directory + package.json + wrangler.toml
- [ ] Run `vp install` to sync workspaces

## Step 2: `packages/shared` — Slim Zod Schemas

Slim models — only fields Earnie uses. No passthrough needed since we control the cache layer.

### Files:

**`src/earn-types.ts`**

- `VaultSchema` — address, chainId, name, slug, protocol (name, url), underlyingTokens[] (address, symbol, decimals), tags[], analytics (apy.base/reward/total, apy1d/7d/30d, tvl.usd), isTransactional, isRedeemable
- `VaultListResponseSchema` — { data: Vault[], nextCursor: string | null, total: number }
- `PortfolioPositionSchema` — chainId, protocolName, asset (address, name, symbol, decimals), balanceUsd, balanceNative
- `PortfolioResponseSchema` — { positions: PortfolioPosition[] }

**`src/vault-filters.ts`**

- `RiskTier` type: `"safe" | "growth" | "bold"`
- `VaultFilterParams` type: { tag?, chainId?, asset?, minApy?, minTvl?, sortBy?, riskTier? }
- `getRiskTier(vault)` function — rule-based classification:
  - safe: stablecoin tag + TVL > $10M + APY < 15%
  - bold: il-risk tag OR APY > 30%
  - growth: everything else

**`src/agent-types.ts`**

- `ChatMessage` — { role: "user" | "assistant", content: string }
- `AgentRequest` — { messages: ChatMessage[], userAddress?: string }
- `AgentResponse` — { reply: string, toolCalls?: ToolCallRecord[] }
- `ToolCallRecord` — { name: string, input: unknown, output: unknown }

**`src/points.ts`** (stub)

- `UserPoints` type — { userId: string, points: number, streak: number, achievements: string[] }

**`src/index.ts`** — re-export all

## Step 3: `packages/worker` — Hono + zod-openapi on CF Workers

### Setup

- Hono + `@hono/zod-openapi` for typed routes
- `wrangler.toml` with KV namespace binding (`VAULT_CACHE`)
- `.dev.vars` (gitignored): `CLAUDE_API_KEY`, `COMPOSER_API_KEY`
- Env type bindings for Hono context

### Files:

**`src/index.ts`** — Hono app

- CORS middleware (allow localhost + deployed origins)
- Env bindings type: { CLAUDE_API_KEY, COMPOSER_API_KEY, VAULT_CACHE (KV) }
- Mount all routes
- `GET /api/health` → `{ status: "ok", cached_vaults: number }`

**`src/earn-cache.ts`** — On-demand + stale-while-revalidate

- `getVaults(env, filters?)`:
  1. Check KV for cached vault list (key: `vaults:all`)
  2. If fresh (< 5min TTL) → return cached, apply filters
  3. If stale → return stale immediately, trigger background refresh via `ctx.waitUntil()`
  4. If missing → fetch all pages from `earn.li.fi/v1/earn/vaults` (paginate via nextCursor), store in KV, return
- `fetchAllVaults()` — paginated fetch loop, handles nextCursor, respects 100 req/min rate limit
- `filterVaults(vaults, params)` — apply VaultFilterParams
- `sortVaults(vaults, sortBy)` — sort by apy.total, tvl, or risk-adjusted

**`src/rules.ts`** — Risk tier + ranking logic

- `getRiskTier(vault)` — imported from shared, but also applied here for bulk classification
- `rankVaults(vaults, criteria)` — composite scoring: APY weight + TVL weight + risk penalty
- `categorizeByTier(vaults)` — group into { safe: [], growth: [], bold: [] }

**`src/agent.ts`** — Claude tool_use orchestration (non-streaming, Day 1)

- `handleChat(messages, userAddress, env)`:
  1. Build Claude messages array from chat history
  2. Minimal system prompt: "You are Earnie, a friendly yield assistant. Help users find the best yield vaults. Explain in simple terms. Use tools to get real data."
  3. Call Claude API with tool definitions
  4. **Tool execution loop:**
     - If Claude responds with `tool_use` → execute tool locally → append tool_result → call Claude again
     - Repeat until Claude gives a text response (max 5 iterations)
  5. Return final text response + tool call log
- Tool handlers:
  - `discover_vaults(args, env)` → calls `getVaults()` from earn-cache with filters
  - `get_vault_detail(args, env)` → fetch single vault from `earn.li.fi/v1/earn/vaults/:network/:address`
  - `get_portfolio(args, env)` → fetch from `earn.li.fi/v1/earn/portfolio/:addr/positions`
  - `build_deposit_tx(args, env)` → calls Composer (see below)

**`src/composer.ts`** — Composer /v1/quote proxy

- `getQuote(params, env)`:
  - Build query string: fromChain, toChain, fromToken, toToken (vault address!), fromAddress, toAddress, fromAmount
  - `GET https://li.quest/v1/quote?...` with `x-lifi-api-key` header
  - Return full quote response (includes transactionRequest)
- Used by `build_deposit_tx` tool in agent

### Routes (zod-openapi):

| Method | Path                | Description                                                                 |
| ------ | ------------------- | --------------------------------------------------------------------------- |
| `POST` | `/api/chat`         | Agent conversation — JSON req/res (non-streaming)                           |
| `GET`  | `/api/vaults`       | Cached vault list with query filters (tag, chainId, minApy, minTvl, sortBy) |
| `GET`  | `/api/vaults/:slug` | Single vault detail                                                         |
| `GET`  | `/api/quote`        | Composer quote proxy (pass-through with API key)                            |
| `GET`  | `/api/health`       | Healthcheck                                                                 |

## Step 4: Test via curl

```bash
# Health
curl http://localhost:8787/api/health

# Vault list with filters
curl "http://localhost:8787/api/vaults?tag=stablecoin&minApy=5&sortBy=apy"

# Agent: vault recommendation
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is the best USDC vault right now?"}]}'

# Agent: full deposit flow
curl -X POST http://localhost:8787/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"I want to deposit 100 USDC into the safest vault. My address is 0x1234..."}]}'
# Expected: Claude discovers vaults → picks safest → calls build_deposit_tx → returns recommendation + transactionRequest
```

## Step 5: Deploy

- [ ] `wrangler deploy` — publish to CF edge
- [ ] `wrangler secret put CLAUDE_API_KEY`
- [ ] `wrangler secret put COMPOSER_API_KEY`
- [ ] Create KV namespace: `wrangler kv namespace create VAULT_CACHE`
- [ ] Verify deployed endpoints via curl

---

## Dependency Install List (worker)

```
hono
@hono/zod-openapi
@anthropic-ai/sdk
zod
```

Dev deps:

```
wrangler
@cloudflare/workers-types
```

## After Day 1: Update master-plan.md

- [ ] Mark Day 1 tasks as `[x]` in master-plan.md
- [ ] Note any scope changes (deferred items, discovered issues)
- [ ] Update Day 2 scope if anything shifted
