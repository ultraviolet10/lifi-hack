# Earnie — Implementation Plan

## Context

**Problem:** No "pocket-friendly" DeFi yield app exists for retail users. Institutional tools dominate. Non-crypto users are locked out by wallet complexity, chain jargon, and protocol sprawl.

**Solution:** Earnie — a CRED-inspired, agent-native pocket DeFi app. FD-style yield display, fully abstracted chains, Claude-powered vault recommendations, Privy embedded wallets (email login), and a points system. Built for LI.FI DeFi Mullet Hackathon #1, Track 2 (AI × Earn).

**Deadline:** Apr 14, 2026 (submission tweet during 9AM–12PM ET or UTC+8 window)

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

### Day 1 (Apr 9): Foundation — Monorepo + Worker + Claude Agent

- [ ] Scaffold monorepo with VitePlus `vite:monorepo`
- [ ] Set up `packages/shared` with Zod schemas for Earn API vault response
- [ ] Set up `packages/worker` with Hono on CF Workers
- [ ] Implement `earn-cache.ts`: fetch + cache vault list from `earn.li.fi/v1/earn/vaults` (KV or in-memory, 5min TTL)
- [ ] Implement `rules.ts`: filter vaults by tag (stablecoin), min APY, min TVL, chain
- [ ] Implement `agent.ts`: Claude API with tool_use — tools: `discover_vaults`, `get_vault_detail`, `get_portfolio`
- [ ] Test agent via curl: "What's the best USDC vault?" → Claude calls tools → returns recommendation
- [ ] Deploy worker to CF (wrangler deploy)

### Day 2 (Apr 10): Agent Flow Complete

- [ ] Add Composer quote proxy to worker (hides API key, forwards to `li.quest/v1/quote`)
- [ ] Add `build_deposit_tx` tool to Claude agent (calls Composer via worker)
- [ ] Implement `points.ts` in worker: KV-backed points for deposits, streaks
- [ ] Add `get_points`, `get_achievements` endpoints
- [ ] End-to-end test: ask agent to find vault → get quote → return tx data
- [ ] Set up streaming (SSE) from worker for Claude responses

### Day 3 (Apr 11): React UI + Privy

- [ ] Set up `apps/web` with Vite + React + TypeScript
- [ ] Install + configure Privy (email/Google login → embedded wallet)
- [ ] Build pages: Onboarding → Discover (vault list) → Chat (agent) → Portfolio
- [ ] `useAgent` hook: connect to worker SSE endpoint, manage conversation state (Jotai)
- [ ] `useVaults` hook: TanStack Query fetching from worker's cached vault list
- [ ] Vault cards: name, protocol icon, APY (FD-style "Earn X% p.a."), risk tier badge
- [ ] Deposit flow: user picks vault in chat or UI → agent builds tx → Privy signs
- [ ] Portfolio view: positions from `/v1/earn/portfolio/:addr/positions` via worker
- [ ] Deploy to Vercel

### Day 4 (Apr 12): Points + Canvas + Polish

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
