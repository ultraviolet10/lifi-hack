# Earnie — Implementation Plan

## Context

**Problem:** No "pocket-friendly" DeFi yield app exists for retail users. Institutional tools dominate. Non-crypto users are locked out by wallet complexity, chain jargon, and protocol sprawl.

**Solution:** Earnie — a CRED-inspired, agent-native pocket DeFi app. FD-style yield display, fully abstracted chains, Claude-powered vault recommendations, Privy embedded wallets (email login), and a points system. Built for LI.FI DeFi Mullet Hackathon #1, Track 2 (AI × Earn).

**Deadline:** Apr 14, 2026 (submission tweet during 9AM–12PM ET or UTC+8 window)

---

## Open TODOs / Blockers

### 🔴 Redeploy worker to prod (blocks Day 3 UI work)

Day 2 shipped locally but prod (`earnie-worker.aritrac1998.workers.dev`) still runs the Day 1 bundle. Confirmed Apr 11:
`/api/health` 200 ✅, `/api/vaults` 200 ✅, `/api/chat` 200 with `discover_vaults` ✅, **`/api/chat/stream` 404 ❌**, `plan_goal` never called ❌.

Day 3's `apps/web` points `VITE_WORKER_BASE_URL` at this host. Every `useAgent` / `useVaults` / `usePortfolio` hook hits stale code until this is redone. Fix first, then start UI.

#### Pre-deploy (safety net — run from repo root)

- [ ] `vp check` — format + lint + type-check across monorepo (must be green)
- [ ] `cd packages/worker && bun run build` — `wrangler deploy --dry-run --outdir dist` catches bundle errors before they hit prod
- [ ] `cd tools/smoke-deposit && bun run smoke` against **local** `wrangler dev` first — confirms end-to-end loop (agent → Composer → viem eth_call) still passes or soft-passes. Do NOT skip; this is the one guard on Composer shape drift.
- [ ] `git diff packages/worker/wrangler.toml` — confirm `workers_dev = true` + `id = "a44d4ce57b0c4ff3a2b5c37b1b8a9677"` present (already staged, just verify nothing weird got added)
- [ ] Visual diff `packages/worker/src/index.ts` — verify `hono/logger`, `streamSSE` import, and `/api/chat/stream` route all present

#### Auth + secrets preflight

- [ ] `bunx wrangler whoami` — confirm logged in as the account that owns KV namespace `a44d4ce57b0c4ff3a2b5c37b1b8a9677`. If not: `bunx wrangler login`.
- [ ] `bunx wrangler secret list` (from `packages/worker/`) — must show `CLAUDE_API_KEY` + `COMPOSER_API_KEY`. Day 1 set both; if a redeploy wiped them (shouldn't, but verify): `bunx wrangler secret put CLAUDE_API_KEY` / `COMPOSER_API_KEY`.
- [ ] Sanity-check KV binding: `bunx wrangler kv namespace list | grep a44d4ce5` — binding id must match `wrangler.toml:8`.

#### Deploy

- [ ] `cd packages/worker && bun run deploy` (= `wrangler deploy`)
- [ ] Watch output for: `Uploaded earnie-worker`, `Deployed earnie-worker triggers`, final URL `https://earnie-worker.aritrac1998.workers.dev`, and the new version id. Record the version id in case of rollback.
- [ ] In a second terminal: `bunx wrangler tail` — keep it open for the verification curls below so you see request logs + any runtime errors live.

#### Post-deploy verification (all must pass before Day 3 starts)

1. [ ] `curl https://earnie-worker.aritrac1998.workers.dev/api/health` → `{"status":"ok", "cached_vaults": N, ...}`
2. [ ] `curl 'https://earnie-worker.aritrac1998.workers.dev/api/vaults?tag=stablecoin&minApy=5&sortBy=apy'` → filtered JSON list
3. [ ] `curl -X POST https://earnie-worker.aritrac1998.workers.dev/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"find me safe USDC vaults on Base"}]}'` → `reply` populated, `toolCalls` includes `discover_vaults`
4. [ ] `curl -X POST https://earnie-worker.aritrac1998.workers.dev/api/chat -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"Plan a savings goal for me: target $500, deadline 2026-12-31, I have $200. Then show matching vaults."}]}'` → `toolCalls` **must include `plan_goal`** before/alongside `discover_vaults`. **If it doesn't** → tighten system-prompt imperative in `agent.ts:34` OR add the `/api/plan-goal` REST escape hatch (see Day 3.0 below). Don't ship Day 3 on a flaky tool-selection.
5. [ ] `curl -N -X POST https://earnie-worker.aritrac1998.workers.dev/api/chat/stream -H 'content-type: application/json' -d '{"messages":[{"role":"user","content":"find me safe USDC vaults on Base"}]}'` → SSE frames arrive incrementally: `event: iteration`, `event: text_delta` (multiple), `event: tool_use_start`, `event: tool_result`, `event: done`. Not a single batched blob.
6. [ ] `cd tools/smoke-deposit && WORKER_URL=https://earnie-worker.aritrac1998.workers.dev TEST_WALLET_ADDRESS=0x... BASE_RPC_URL=https://mainnet.base.org bun run smoke` → PASS or SOFT PASS (approval-gated).
7. [ ] `wrangler tail` shows each request logged by `hono/logger` middleware (confirms new bundle is serving, not cached Day 1 code).
8. [ ] CORS preflight from what will be Day 3's dev origin: `curl -I -X OPTIONS -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' https://earnie-worker.aritrac1998.workers.dev/api/chat/stream` → 204 + `access-control-allow-origin: http://localhost:5173`. (Already in `index.ts:27-34` allow-list, just confirm.)

#### Rollback plan (if any verify step fails destructively)

- [ ] `bunx wrangler deployments list` → find the last-known-good version id
- [ ] `bunx wrangler rollback <version-id>` → restores previous bundle without re-upload
- [ ] Re-run steps 1-8

### 🟡 Other open items

- [ ] **Rotate `CLAUDE_API_KEY` + `COMPOSER_API_KEY` post-hackathon** — both were exposed in assistant context during Day 1 deploy (`.dev.vars` Read).
- [ ] **`plan_goal` tool-selection reliability** — observed skipped on prod even on explicit goal prompts (Apr 11). Decide before Day 3: (a) harder system-prompt imperative in `agent.ts:34`, (b) add a dedicated `POST /api/plan-goal` REST route that calls `planGoal()` directly, bypassing Claude — gives Day 3 UI a deterministic `Goal.tsx` page and a 25%-innovation surface that can't disappear mid-demo, or (c) agent-only with a "Plan a goal" chat quick-chip that injects a templated prompt. **Recommended: (b)** — `goal.ts` is pure, exposing it is ~15 lines, and it converts a fragile chat surface into a first-class navigable/screenshot-able feature.
- [ ] **Known bug `agent.ts:185-191`** — wallet prefix injected into `messages[0]` regardless of multi-turn position. Harmless for curl, **breaks on Day 3 `Chat.tsx` multi-turn UI** (prefix stacks on every reply). Fix before wiring `useAgent`: target the latest user-role message in the array instead of index 0.
- [ ] **Abort-signal leak in `executeTool`** — SSE cancel only kills the Claude call; inner fetches (Earn API, Composer, vault detail, portfolio) ignore the signal. Harmless for curl, **race-writes on Day 3 Chat.tsx** when user types a second question before the first finishes. Day 3 `useAgent` needs a client-side request-id guard (ignore responses from superseded streams) until worker-side fix lands.
- [ ] **`tools/smoke-deposit/.env.example`** — trivial, non-blocking.
- [ ] **OpenAPI / Scalar docs** — worker currently uses raw Hono routes, not `@hono/zod-openapi`. Deferred from Day 1. Optional polish for Day 4 if time allows.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    apps/web                          │
│  Vite + React + Privy + Pretext Canvas              │
│  TanStack Query (server) + Jotai (client)           │
│  UI: vault cards, agent chat, portfolio, points     │
└──────────────────┬──────────────────────────────────┘
                   │ SSE / fetch
┌──────────────────▼──────────────────────────────────┐
│              packages/worker                         │
│  Cloudflare Worker (smart edge layer)               │
│  ├─ Earn API cache (vault list, 5min TTL)           │
│  ├─ Rule-based vault filtering/ranking              │
│  ├─ Claude API proxy (tool_use for reasoning)       │
│  ├─ Composer /v1/quote proxy (hides API key)        │
│  └─ Cloudflare KV (points, streaks, prefs)          │
└──────────────────┬──────────────────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
  earn.li.fi   li.quest    Claude API
  (no auth)    (API key)   (API key)
```

## Monorepo Structure (VitePlus `vite:monorepo`)

```
earnie/
├── apps/
│   └── web/                    # Vite + React app
│       ├── src/
│       │   ├── components/     # React DOM components
│       │   ├── canvas/         # Pretext Canvas overlays
│       │   ├── hooks/          # useAgent, useVaults, usePortfolio
│       │   ├── stores/         # Jotai atoms
│       │   ├── pages/          # Onboard, Discover, Portfolio, Chat
│       │   └── lib/            # Privy config, API client
│       └── vite.config.ts
├── packages/
│   ├── worker/                 # Cloudflare Worker
│   │   ├── src/
│   │   │   ├── index.ts        # Router (Hono on Workers)
│   │   │   ├── agent.ts        # Claude tool_use orchestration
│   │   │   ├── earn-cache.ts   # Earn API cache layer
│   │   │   ├── rules.ts        # Rule-based vault filtering
│   │   │   └── points.ts       # KV-backed points system
│   │   └── wrangler.toml
│   └── shared/                 # Shared types & schemas
│       ├── earn-types.ts       # Zod schemas for Earn API responses
│       ├── vault-filters.ts    # Filter/sort type definitions
│       ├── points.ts           # Points/achievement types
│       └── agent-types.ts      # Chat message types
├── package.json
└── vp.config.ts
```

## Day-by-Day Build Plan

### Day 1 (Apr 9–10): Foundation — Monorepo + Worker + Claude Agent ✅

- [x] Scaffold monorepo with VitePlus `vite:monorepo`
- [x] Set up `packages/shared` with Zod schemas for Earn API vault response
- [x] Set up `packages/worker` with Hono on CF Workers
- [x] Implement `earn-cache.ts`: stale-while-revalidate KV cache, paginated fetch from `earn.li.fi/v1/earn/vaults`
- [x] Implement `rules.ts` + `vault-filters.ts`: tag, chainId, asset, minApy, minTvl, riskTier filtering + `getRiskTier()` classifier
- [x] Implement `agent.ts`: Claude `claude-sonnet-4` with tool_use loop — tools: `discover_vaults`, `get_vault_detail`, `get_portfolio`, `build_deposit_tx`
- [x] **Scope pull-in from Day 2:** `composer.ts` quote proxy + `build_deposit_tx` tool shipped in Day 1 (Composer `/v1/quote` forwarded with `x-lifi-api-key`)
- [x] Local curl smoke tests: `/api/health`, `/api/vaults?tag=stablecoin&minApy=5&sortBy=apy` (real Earn API data cached, filters applied)
- [x] Deploy worker to CF: KV namespace `VAULT_CACHE` (`a44d4ce57b0c4ff3a2b5c37b1b8a9677`) + `workers_dev=true` + secrets uploaded → `https://earnie-worker.aritrac1998.workers.dev`
- [ ] **Pending:** verify prod endpoints (see Open TODOs — TLS cert propagation)
- [ ] **Deferred:** `@hono/zod-openapi` routes (raw Hono used instead — sufficient for hackathon)

### Day 2 (Apr 11): Streaming + Goal Planning + Deposit Simulation ✅

**Scope note:** Points moved to Day 4 (no judging dimension). Day 2 focused on eliminating backend surprises before Day 3 UI work: SSE streaming, the `plan_goal` innovation hook, and a full `build_deposit_tx` → Composer → viem eth_call simulation loop. Real broadcast stays on Day 3 via wagmi. See `day_2.md` for the full stage breakdown.

#### 2.1 Agent streaming (SSE) ✅

- [x] `runAgentLoop` async generator yielding `AgentEvent` union (`iteration` / `text_delta` / `tool_use_start` / `tool_result` / `done` / `error`) — lives inline in `packages/worker/src/agent.ts` (not extracted to `agent-loop.ts` — minor deviation from plan, functionally equivalent)
- [x] `handleChat` reduced to a generator drain; `/api/chat` shape unchanged externally
- [x] New route `POST /api/chat/stream` in `index.ts` using `hono/streaming` `streamSSE` + `AbortController`; `stream.onAbort` cancels Claude SDK stream via `{ signal }` option
- [x] `AgentEvent` union added to `packages/shared/src/types/agent-types.ts`
- [x] Errors caught inside generator → `{ type: "error", where: "model" | "tool" | "abort", message }`; generator never throws

#### 2.2 `plan_goal` tool + goal math ✅

- [x] New `packages/worker/src/goal.ts` — pure `planGoal()` annuity solver (FV = PV·(1+r)ⁿ + PMT·((1+r)ⁿ − 1)/r, r = apy/12)
- [x] Blended APY assumptions: safe 4.5% / growth 8% / bold 14%. `auto` rule: ≤12mo→safe, ≤36mo→growth, >36mo→bold
- [x] Edge cases covered: `deadline_past`, `zero_months`, `already_met`, r=0 fallback, 600-month clamp
- [x] 5th tool registered in `agent.ts` with schema + system-prompt nudge ordering it _before_ `discover_vaults` on goal-framed prompts
- [x] `executeTool` switch extended with `case "plan_goal"`

#### 2.3 Smoke deposit script ✅

- [x] New workspace `tools/smoke-deposit/` (`package.json`, `tsconfig.json`, `index.ts`) — already picked up by root `workspaces: ["tools/*"]`
- [x] Flow: POST `/api/chat` → parse `AgentResponse.toolCalls` → extract `build_deposit_tx` output → pull `transactionRequest` (or `includedSteps[0]`) → `viem` `publicClient.call()` on Base
- [x] Hex-safe `toBig()` helper handles both `0x`-prefixed and decimal `value` / `gasLimit`
- [x] Multi-step quotes logged + step-1 simulated; ERC20 allowance reverts (`TRANSFER_FROM_FAILED` / `insufficient allowance`) treated as **SOFT PASS** — shape is valid, Day 3 UI must prepend `USDC.approve(router, amount)` before the deposit tx
- [ ] `tools/smoke-deposit/.env.example` — trivial, non-blocking follow-up

#### 2.4 Dev hygiene ✅

- [x] `hono/logger` middleware mounted in `packages/worker/src/index.ts`
- [x] `packages/worker/wrangler.toml` committed with real KV id `a44d4ce57b0c4ff3a2b5c37b1b8a9677` + `workers_dev = true`
- [x] `master-plan.md` Day 2 section rewritten (this block); points moved to Day 4
- [ ] **Known issue (flagged, not fixed):** `agent.ts:185-191` injects `[User wallet: …]` prefix into `messages[0]` regardless of multi-turn position — should target the latest user message on subsequent turns. Addressed Day 3 when React client drives multi-turn chats.
- [ ] **Known issue (flagged, not fixed):** `executeTool` inner fetches (Earn API, Composer, vault detail, portfolio) don't accept the abort `signal` — SSE cancel only kills the Claude call, not downstream HTTP. Day 3 follow-up.

#### 2.5 Prod verification

- [ ] Re-run against `https://earnie-worker.aritrac1998.workers.dev` (once TLS cert propagates): `/api/health`, `/api/vaults?tag=stablecoin&minApy=5`, `/api/chat` with goal-framed prompt, `/api/chat/stream` incremental frames
- [ ] Fallback: custom domain `earnie-api.<yourdomain>` if cert still stuck

**Exit criteria:** `curl -N -X POST .../api/chat/stream` emits incremental SSE frames. `plan_goal` fires before `discover_vaults` on goal-framed prompts. `bun run smoke` produces PASS or SOFT PASS for the agent's free-choice vault on Base.

### Day 3 (Apr 12): React UI + Privy + Agent Integration

**Current state of `apps/web`:** scaffolded as VitePlus vanilla TS template (`counter.ts`, `style.css`, `main.ts`). Needs full conversion to React. No Privy, no TanStack Query, no Jotai installed yet.

#### 3.1 React scaffold + deps

- [ ] Rip out `counter.ts`, wire up React entry:
  - Install: `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react` (via `vp add`)
  - `vite.config.ts` — add `@vitejs/plugin-react`
  - `src/main.tsx` replaces `main.ts` — mounts `<App />` to `#app`
  - `index.html` — keep `<div id="app">`, update script to `/src/main.tsx`
- [ ] Install UI stack: `@tanstack/react-query`, `jotai`, `@privy-io/react-auth`, `wagmi`, `viem`
- [ ] Install routing: `react-router-dom` v7
- [ ] Tailwind: `tailwindcss`, `@tailwindcss/vite` — set up `tailwind.config.js` + `src/index.css`

#### 3.2 Privy + wallet plumbing

- [ ] `src/lib/privy.tsx` — `<PrivyProvider>` wrapper with appId, embedded wallet config (email/Google, auto-create on login, no external wallets for v1)
- [ ] `src/lib/wagmi.ts` — wagmi config for mainnet, arbitrum, optimism, base, polygon (chains the agent suggests)
- [ ] `.env.local` — `VITE_PRIVY_APP_ID`, `VITE_WORKER_BASE_URL=https://earnie-worker.aritrac1998.workers.dev`
- [ ] Wrap app: `<PrivyProvider><WagmiProvider><QueryClientProvider>{app}</QueryClientProvider></WagmiProvider></PrivyProvider>`

#### 3.3 API client + hooks

- [ ] `src/lib/api.ts` — typed fetch wrappers around worker endpoints, imports types from `shared`
  - `getVaults(filters)` → `VaultListResponse`
  - `getVault(slug)` → `Vault`
  - `postChat(messages, userAddress)` → `AgentResponse` (non-streaming, for v1 — swap to SSE in 3.5)
  - `getPortfolio(address)` → `PortfolioResponse`
  - `getPoints(address)` → `UserPoints`
- [ ] `src/hooks/useVaults.ts` — TanStack Query, `queryKey: ['vaults', filters]`, 5min staleTime (matches worker cache)
- [ ] `src/hooks/usePortfolio.ts` — gated on privy user address
- [ ] `src/hooks/useAgent.ts` — Jotai atom for `messages[]`, mutation that appends user msg, posts to `/api/chat`, appends response
- [ ] `src/stores/chat.ts` — Jotai `messagesAtom`, `isStreamingAtom`

#### 3.4 Pages + routing

- [ ] `src/pages/Onboard.tsx` — hero + "Login with email" button → Privy modal → redirect to `/discover`
- [ ] `src/pages/Discover.tsx` — grid of vault cards (TanStack Query), filter chips (safe/growth/bold), sort dropdown
- [ ] `src/pages/Chat.tsx` — messages list + input box + "Deposit via agent" CTA
- [ ] `src/pages/Portfolio.tsx` — user positions + total balance + points widget
- [ ] `src/App.tsx` — react-router routes, nav bar, auth guard (redirect to `/` if not logged in)

#### 3.5 Vault card + deposit flow

- [ ] `src/components/VaultCard.tsx` — name, protocol, APY ("Earn X% p.a." FD-style), TVL, risk tier badge (color-coded), `View` / `Deposit` actions
- [ ] Deposit flow:
  1. User clicks `Deposit` on card OR asks agent in chat
  2. Agent calls `build_deposit_tx` → returns `{ transactionRequest }`
  3. Frontend calls `wagmi` `useSendTransaction()` with that request → Privy signs via embedded wallet
  4. On tx hash, award points (POST /api/points/:addr/award)
  5. Refresh portfolio query
- [ ] Loading/error states on each step

#### 3.6 Streaming upgrade (if time)

- [ ] Swap `useAgent` to consume `/api/chat/stream` via `EventSource` or fetch-stream reader
- [ ] Incremental text rendering in `Chat.tsx`

#### 3.7 Deploy

- [ ] `vp build` apps/web → static output
- [ ] Deploy to Cloudflare Pages (same account, keeps everything on CF) OR Vercel if preferred
- [ ] Wire `VITE_WORKER_BASE_URL` in prod env
- [ ] Update worker CORS `origin` list to include prod web origin

**Exit criteria:** user logs in with email → sees vault grid → asks agent "deposit 10 USDC into safest vault" → signs tx with embedded wallet → sees position in portfolio + points awarded. Fully live at a public URL.

### Day 4 (Apr 12): Points + Canvas + Polish

#### 4.1 Points + achievements (KV-backed) — moved from Day 2

- [ ] New file `packages/worker/src/points.ts`
  - KV key shape: `points:{privyDid}` → `{ points, streak, lastActionAt, achievements[] }` (Privy DID, **not** wallet address — day_2.md locked this; master-plan line 7 still references address loosely)
  - `getPoints(env, did)` — read or initialize
  - `awardPoints(env, did, action, amount)` — increment, update streak, check thresholds
  - Actions: `first_deposit` (+100), `deposit` (+10), `chat_session` (+5), `daily_streak` (+bonus)
- [ ] Achievement rules: `first_deposit`, `3_day_streak`, `5_vaults_explored`, `power_user` (10+ deposits)
- [ ] Add `get_points` tool to Claude agent
- [ ] Routes:
  - `GET /api/points/:did` → `{ points, streak, achievements }`
  - `POST /api/points/:did/award` → **worker-internal only**, gated by shared secret header (trust model locked in day_2.md Q&A)
- [ ] Update `shared/src/points.ts` types to match runtime shape

#### 4.2 UI + polish

- [ ] Points UI: display points, streak counter, achievement badges
- [ ] Pretext Canvas overlays (scope based on available time):
  - [ ] APY number ticker animation (odometer effect)
  - [ ] Yield growth visualization (rising graph / particles)
  - [ ] Chat text effects (typewriter, highlighted vault names)
  - [ ] Page transitions
- [ ] Playful/colorful styling (Cash App vibes — bold colors, rounded elements)
- [ ] Responsive mobile-first layout
- [ ] Error handling, loading states, edge cases (null APY, 0 TVL)
- [ ] End-to-end testing with real small deposit

### Day 5 (Apr 13–14): Demo + Submit

- [ ] Record demo video showing full flow: login → agent recommends → deposit → portfolio → points
- [ ] Write submission tweet thread:
  - Project name + what it does
  - Demo video
  - GitHub repo + live app link
  - "Track 2: AI × Earn"
  - Tag @lifiprotocol @kenny_io
- [ ] Write brief project description (what, how, what's next, API feedback)
- [ ] Schedule tweet for Apr 14 morning (submission window)
- [ ] Fill Google Form: https://forms.gle/1PCvD9BymH1EyRmV8

## Key Technical Decisions

| Decision   | Choice                             | Why                                                                               |
| ---------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| LLM        | Claude API via CF Worker           | Best reasoning for vault recommendations, tool_use for structured Earn API calls  |
| Edge layer | CF Worker (smart, not thin proxy)  | Cache vaults, apply rules before Claude, save tokens + latency                    |
| Wallet     | Privy embedded                     | Email login, no MetaMask, UPI-like simplicity                                     |
| State      | TanStack Query + Jotai             | TQ for server cache (vaults, portfolio), Jotai for local atoms (chat, points, UI) |
| Monorepo   | VitePlus 3-pkg                     | Clean separation: web/worker/shared. Solo dev but organized                       |
| Deploy     | Vercel (static) + CF Workers (API) | Free tiers, optimized for each layer                                              |
| Canvas     | Pretext (day 4 polish)             | Ambitious but deprioritized. CSS fallbacks for everything                         |

## Agent Persona & System Prompt

> **BOOKMARK: ITERATE LATER** — Start with a minimal system prompt on Day 1. Tighten persona, add few-shot examples, and refine tone after observing how Claude handles the tools with real Earn API data. Don't over-engineer the prompt before seeing actual agent behavior.

## Claude Agent Tool Definitions

```typescript
// Tools the Claude agent can call via tool_use
const tools = [
  {
    name: "discover_vaults",
    description: "Find yield vaults matching criteria",
    input_schema: {
      type: "object",
      properties: {
        asset: { type: "string", description: "Token symbol: USDC, ETH, etc." },
        risk_tier: { enum: ["safe", "growth", "bold"] },
        min_apy: { type: "number" },
        chain: { type: "string", description: "Chain name or 'any'" },
      },
    },
  },
  {
    name: "get_vault_detail",
    description: "Get full details for a specific vault",
    input_schema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "build_deposit_tx",
    description: "Build a deposit transaction via Composer",
    input_schema: {
      type: "object",
      properties: {
        vault_address: { type: "string" },
        vault_chain_id: { type: "number" },
        from_token: { type: "string" },
        from_chain_id: { type: "number" },
        amount: { type: "string" },
        user_address: { type: "string" },
      },
      required: ["vault_address", "vault_chain_id", "from_token", "amount", "user_address"],
    },
  },
  {
    name: "get_portfolio",
    description: "Get all DeFi positions for a wallet",
    input_schema: {
      type: "object",
      properties: { address: { type: "string" } },
      required: ["address"],
    },
  },
  {
    name: "get_points",
    description: "Get user's points, streak, and achievements",
    input_schema: {
      type: "object",
      properties: { user_id: { type: "string" } },
      required: ["user_id"],
    },
  },
];
```

## Risk Tier Mapping (Rule-Based)

```typescript
// packages/shared/vault-filters.ts
function getRiskTier(vault: Vault): "safe" | "growth" | "bold" {
  const tvl = Number(vault.analytics.tvl.usd);
  const hasStablecoinTag = vault.tags.includes("stablecoin");
  const hasILRisk = vault.tags.includes("il-risk");
  const apy = vault.analytics.apy.total;

  if (hasStablecoinTag && tvl > 10_000_000 && apy < 15) return "safe";
  if (hasILRisk || apy > 30) return "bold";
  return "growth";
}
```

## Verification / Testing

1. **Worker health:** `curl https://earnie-worker.<your-subdomain>.workers.dev/health`
2. **Vault cache:** `curl .../api/vaults?tag=stablecoin&minApy=5` → returns filtered list
3. **Agent e2e:** `curl -X POST .../api/chat -d '{"message":"find me safe USDC vaults"}'` → Claude responds with recommendations
4. **Deposit flow:** Connect with Privy → agent recommends vault → click deposit → Privy signs tx → position appears in portfolio
5. **Points:** After deposit, points increment, streak starts, badge unlocked
6. **Canvas:** APY numbers animate on vault cards, chat has typewriter effect
7. **Mobile:** Test on phone-sized viewport, all flows work touch-first
