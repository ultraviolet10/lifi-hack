# Day 2 — Streaming, Goal Planning, Deposit Simulation

## Context

Day 1 shipped the Earnie Cloudflare Worker backbone: Hono routes, Earn API cache, rule-based vault filtering, Composer proxy, and a Claude tool_use loop with `discover_vaults` / `get_vault_detail` / `get_portfolio` / `build_deposit_tx`. Day 3 flips the repo to React + Privy + wagmi and wires real on-chain deposits from the UI. Day 2 sits between them and exists to eliminate backend surprises before that rush.

**Reframed milestone after reading the hackathon guide (judging = 35% API integration + 25% innovation + 20% completeness + 20% presentation):**

> Prove the end-to-end agent → Composer loop on localhost with real Earn data, land SSE streaming for the demo feel, and scaffold goal-based savings planning as the 25%-innovation hook. Points deferred entirely to Day 4 (they don't map to any judging dimension). Real fund broadcast is Day 3's job — today is eth_call simulation only.

The load-bearing Day 2 deliverable is `tools/smoke-deposit/` — an end-to-end script that exercises the full loop (worker chat → Claude → build_deposit_tx → Composer → transactionRequest → viem simulation) against real Earn data. If Composer returns an un-broadcastable shape, discovering it today costs an hour; discovering it Day 3 mid-UI burns a day.

## Scope locked via Q&A

| Decision                             | Choice                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| SSE streaming                        | Ship Day 2                                                                               |
| Points system                        | Move entirely to Day 4                                                                   |
| Points identity (when Day 4 arrives) | Privy DID (not wallet address; master-plan line 113 still says address — flag for Day 4) |
| `/award` trust model (Day 4)         | Worker-internal only, shared secret                                                      |
| Innovation hook                      | Goal-based planning: compute-only, session-ephemeral                                     |
| Real broadcast                       | Day 3 via wagmi; Day 2 is eth_call only                                                  |
| Vault choice for smoke               | Agent free-choice on Base USDC                                                           |
| Prod TLS cert                        | Unblock on localhost, re-verify EOD                                                      |

## Critical files

**Edit:**

- `packages/worker/src/agent.ts` (129-205 refactor; 30-127 append `plan_goal` tool; 8-26 system prompt append)
- `packages/worker/src/index.ts` (74-81 routes; add logger middleware; add `/api/chat/stream`)
- `packages/shared/src/types/agent-types.ts` (add `AgentEvent` discriminated union)
- `master-plan.md` (rewrite Day 2 section; move points to Day 4)

**Create:**

- `packages/worker/src/agent-loop.ts` — extracted `runAgentLoop` async generator
- `packages/worker/src/goal.ts` — pure `planGoal()` annuity math
- `tools/smoke-deposit/package.json`
- `tools/smoke-deposit/index.ts`
- `tools/smoke-deposit/.env.example`

**Read / reuse (do not modify):**

- `packages/worker/src/earn-cache.ts` — `getVaults`, `filterVaults`, `sortVaults` (already called from executeTool)
- `packages/worker/src/composer.ts` — `getQuote()` raw LI.FI passthrough; smoke script reads its output shape
- `packages/worker/src/rules.ts` — `rankVaults`, `categorizeByTier` (untouched)
- `packages/shared/src/vault-filters.ts` — `getRiskTier` (reused by `goal.ts` to map risk_tier → apy assumption)

## Implementation plan

### Task order (risk-first)

1. **2.3 Smoke script** — biggest unknown; if Composer output is malformed everything downstream shifts.
2. **2.2 `plan_goal` tool** — innovation hook; low refactor risk.
3. **2.1 SSE streaming** — heaviest refactor but well understood.
4. **2.4 Hygiene** — logger, wrangler.toml commit, master-plan update.
5. **2.5 Prod verification** — EOD sanity pass.

---

### 2.3 Smoke deposit script (~2h)

**`tools/smoke-deposit/package.json`**

```json
{
  "name": "smoke-deposit",
  "private": true,
  "type": "module",
  "scripts": { "smoke": "bun run index.ts" },
  "dependencies": {
    "viem": "^2.21.0",
    "shared": "workspace:*"
  },
  "devDependencies": { "@types/bun": "latest", "typescript": "^6.0.2" }
}
```

Root `package.json` workspaces already include `tools/*` so `bun install` picks it up.

**`tools/smoke-deposit/index.ts` structure:**

1. Load env (`Bun.env.WORKER_URL`, `TEST_WALLET_ADDRESS`, `BASE_RPC_URL`). Die with clear message on any miss.
2. POST `${WORKER_URL}/api/chat` with
   ```
   { messages: [{ role: "user",
       content: "I want to deposit 10 USDC into the safest USDC vault on Base. My wallet: ${TEST_WALLET}" }],
     userAddress: TEST_WALLET }
   ```
3. Parse response as `AgentResponse` (import from `shared`). Find `toolCalls.find(t => t.name === "build_deposit_tx")`.
4. Check for `output.error` first (agent.ts:272-274 wraps Composer errors as `{error}`). Bail if present.
5. Detect multi-step: `quote.includedSteps?.length > 1` → log warning, simulate first step only.
6. Extract `transactionRequest = quote.transactionRequest ?? quote.includedSteps[0].transactionRequest`.
7. Build `publicClient` on Base via viem `createPublicClient({ chain: base, transport: http(BASE_RPC_URL) })`.
8. Hex-safe bigint helper: `const toBig = (v) => v ? (v.startsWith("0x") ? hexToBigInt(v) : BigInt(v)) : undefined;`
9. `await publicClient.call({ account: tx.from, to: tx.to, data: tx.data, value: toBig(tx.value) ?? 0n, gas: toBig(tx.gasLimit) })`.
10. Pretty-print: vault picked (from the `discover_vaults` toolCall earlier in `toolCalls`), chainId, gasLimit, simulation result. PASS if reached; FAIL with decoded revert reason if viem throws.

**Assumption flag (document in file header):** LI.FI `/v1/quote` returns `transactionRequest` with `value`/`gasLimit`/`gasPrice` as hex strings. If runtime shows decimal strings, swap to pure `BigInt(v)`.

**Pre-check to document in README:** TEST_WALLET must hold Base USDC + the Composer path typically bundles approval into the route; if simulation reverts with allowance error, re-run with a known-pre-approved vault.

**Success gate:** `bun run smoke` inside `tools/smoke-deposit/` prints `OK simulated; gasLimit=0x... returnData=0x...` with the name of the vault the agent picked.

---

### 2.2 `plan_goal` tool + goal math (~1.5h)

**`packages/worker/src/goal.ts`** — pure function, no env access.

```ts
export interface PlanGoalInput {
  target_amount_usd: number;
  deadline_iso: string; // YYYY-MM-DD
  current_principal_usd?: number;
  risk_preference?: "safe" | "growth" | "bold" | "auto";
}

export interface PlanGoalResult {
  months: number;
  monthlyContribution: number;
  assumedApy: number; // decimal, e.g. 0.045
  riskTier: "safe" | "growth" | "bold";
  projection: { principalUsd: number; targetUsd: number; fvOfPrincipalOnly: number };
  feasibility: "ok" | "already_met" | "deadline_past" | "zero_months";
  notes: string[];
}

export function planGoal(input: PlanGoalInput): PlanGoalResult { ... }
```

**Blended APY assumptions (document rationale inline):**

- safe: 0.045 (USDC money-market floor on Base Morpho/Aave)
- growth: 0.08 (stable LP mix)
- bold: 0.14 (aggressive vaults, below advertised peak)

**`auto` rule:** months ≤ 12 → safe; ≤ 36 → growth; > 36 → bold.

**Math:** PMT from FV:

```
FV = PV*(1+r)^n + PMT * ((1+r)^n - 1) / r
PMT = (FV - PV*(1+r)^n) * r / ((1+r)^n - 1)
```

with `r = apy/12`.

**Edge cases:**

- `deadline_iso` in past → `feasibility:"deadline_past"`, zeros, note.
- `n === 0` → `feasibility:"zero_months"`, `monthlyContribution = max(0, target - principal)`.
- `PV*(1+r)^n ≥ FV` → `feasibility:"already_met"`, `monthlyContribution: 0`, note projected FV.
- `r === 0` fallback → `PMT = (FV - PV)/n`.
- `n > 600` → clamp + note.

**`packages/worker/src/agent.ts` edits:**

- Append 5th entry to `tools` array (after line 126) with the `plan_goal` schema. Description wording nudges Claude to call it _before_ `discover_vaults`:
  > "Decompose a savings goal into a required monthly contribution and a suggested risk tier. Call this FIRST when the user mentions both a target amount and a deadline, BEFORE calling discover_vaults. Then pass the returned riskTier into discover_vaults."
- System prompt append (after line 26): one sentence reinforcing the ordering.
- `executeTool` switch (line 213): add `case "plan_goal": return planGoal(input as unknown as PlanGoalInput);`

No new route, no KV, no persistence.

---

### 2.1 SSE streaming refactor (~2h)

**Extract `runAgentLoop` to `packages/worker/src/agent-loop.ts`:**

```ts
export async function* runAgentLoop(
  request: AgentRequest,
  env: Env,
  ctx: ExecutionContext,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent, void, void> { ... }
```

The generator lifts the current body of `handleChat` (agent.ts:134-204) into yield statements. Keep `SYSTEM_PROMPT`, `tools`, `MAX_TOOL_ITERATIONS`, `executeTool` in `agent.ts`; import them from `agent-loop.ts`.

**Phase flow per outer iteration:**

1. `yield { type: "iteration", index: i }`
2. `const stream = client.messages.stream({ model, max_tokens: 1024, system, messages, tools }, { signal })`
3. `for await (const event of stream)` — on `content_block_delta` with `text_delta`, `yield { type: "text_delta", delta: event.delta.text }`. Ignore `input_json_delta`, `message_start`, `message_stop`, `content_block_start`/`stop`.
4. `const final = await stream.finalMessage()` — returns the fully-assembled `Message` with complete `tool_use` input objects.
5. If `final.stop_reason === "end_turn"`: collect text, `yield { type: "done", reply, toolCalls: toolCallLog }`, `return`.
6. If `final.stop_reason === "tool_use"`: for each `tool_use` block:
   - `yield { type: "tool_use_start", id, name, input }` (only emitted after `finalMessage` so `input` is complete — avoids streaming half-parsed JSON)
   - Wrap `executeTool` in try/catch (generalizes agent.ts:272-274 which currently guards only `build_deposit_tx`). On throw, synthesize `{error: msg}` and continue.
   - Push `{name, input, output}` to `toolCallLog`
   - `yield { type: "tool_result", id, name, ok: !output?.error, summary: JSON.stringify(output).slice(0, 400) }`
   - Append `tool_result` blocks to `messages` as a `user` turn exactly like agent.ts:179-196.
7. Falls out of max iterations → yield done with the "simplify your question" fallback reply.
8. Outer `try/catch`: any error (SDK, unhandled exec) yields `{type: "error", where: "model" | "tool" | "abort", message}` and `return` — never throws out of the generator.

**`packages/shared/src/types/agent-types.ts` — add `AgentEvent` union:**

```ts
export type AgentEvent =
  | { type: "iteration"; index: number }
  | { type: "text_delta"; delta: string }
  | { type: "tool_use_start"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; ok: boolean; summary: string }
  | { type: "done"; reply: string; toolCalls?: ToolCallRecord[] }
  | { type: "error"; message: string; where: "model" | "tool" | "abort" };
```

`AgentRequest`, `AgentResponse`, `ToolCallRecord`, `ChatMessage` unchanged. The `done` event's `toolCalls` is the same shape `AgentResponse.toolCalls` uses — full raw `output` preserved so the smoke script still works and Day 3 UI gets structured tool data.

**`packages/worker/src/agent.ts` — reduce `handleChat` to a generator drain:**

```ts
export async function handleChat(req, env, ctx): Promise<AgentResponse> {
  let reply = "";
  let toolCalls: ToolCallRecord[] | undefined;
  let err: string | undefined;
  for await (const ev of runAgentLoop(req, env, ctx)) {
    if (ev.type === "done") {
      reply = ev.reply;
      toolCalls = ev.toolCalls;
    }
    if (ev.type === "error") {
      err = ev.message;
    }
  }
  if (err) throw new Error(err); // index.ts onError renders 500
  return { reply, toolCalls };
}
```

**`packages/worker/src/index.ts` — new streaming route:**

```ts
import { streamSSE } from "hono/streaming";
import { runAgentLoop } from "./agent-loop.ts";

app.post("/api/chat/stream", async (c) => {
  const body = await c.req.json<AgentRequest>();
  return streamSSE(c, async (stream) => {
    const ac = new AbortController();
    stream.onAbort(() => ac.abort());
    try {
      for await (const ev of runAgentLoop(body, c.env, c.executionCtx, ac.signal)) {
        await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
        if (ev.type === "done" || ev.type === "error") break;
      }
    } catch (e) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ type: "error", message: String(e), where: "model" }),
      });
    }
  });
});
```

Existing `/api/chat` route (index.ts:74-81) is unchanged externally — its handler now delegates to the generator-drained `handleChat`.

**Abort handling caveat:** `executeTool`'s inner `fetch`es (Earn API, Composer, vault detail, portfolio) don't accept a `signal` yet. Short-term accept the leak; document as follow-up. Claude SDK stream will be cancelled via `{ signal }` option — that's the primary long-running call.

---

### 2.4 Dev hygiene (~30m)

- `packages/worker/src/index.ts`: add `import { logger } from "hono/logger"` and `app.use("*", logger())` near the top of middleware.
- Keep `packages/worker/wrangler.toml` staged changes (`workers_dev = true`, real KV id `a44d4ce57b0c4ff3a2b5c37b1b8a9677`) — already in git status `M`.
- `master-plan.md`: rewrite Day 2 section (lines 95-130) to match this plan; move points block into Day 4; remove stale `@hono/zod-openapi` TODO; note the `messages[0]` injection bug at agent.ts:145-148 as a known issue.

---

### 2.5 Prod verification (~30m)

Against `https://earnie-worker.aritrac1998.workers.dev`:

| #   | Command                                                                                                        | Expect                                                |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | `curl .../api/health`                                                                                          | `{status:"ok"}`                                       |
| 2   | `curl '.../api/vaults?tag=stablecoin&minApy=5&sortBy=apy'`                                                     | filtered list                                         |
| 3   | `curl -X POST .../api/chat -d '{"messages":[{"role":"user","content":"save $500 by December, I have $200"}]}'` | toolCalls contains `plan_goal` then `discover_vaults` |
| 4   | `curl -N -X POST .../api/chat/stream -d '{...same...}'`                                                        | incremental SSE `event:` frames                       |

If cert still not live by EOD: fall back to custom domain (`earnie-api.<yourdomain>`).

## Out of scope (explicit cuts)

- Points system, `points.ts`, `/api/points/*` routes → **Day 4**
- Real fund broadcast with wagmi → **Day 3**
- Goal persistence, cron reminders → not this hackathon
- `@hono/zod-openapi` / Scalar docs → not this hackathon
- Fixing `agent.ts:145-148` multi-turn message injection bug → flagged, not scope
- Abort-signal threading into `executeTool` inner fetches → flagged, not scope
- Rate limiting → not this hackathon

## Risks to watch

1. **Composer multi-step quotes** — smoke script simulates step 1 only. Document and proceed.
2. **Claude skips `plan_goal`** — if observed, tighten system-prompt rule or add a pre-tool hint in the user message. Iterate during 2.5.
3. **`stream.finalMessage()` semantics** — SDK v0.52 exposes this, but if it ever throws when stop_reason is `tool_use` we need to fall back to accumulating content blocks manually. Test with a tool-using prompt first.
4. **CF TLS cert still stuck** — custom-domain fallback.
5. **USDC allowance on TEST_WALLET** — eth_call may revert on missing approval if Composer doesn't bundle it. Fallback: pick a vault where the route is single-step + pre-approved, or switch from eth_call to a real $1 broadcast (wallet is funded).

## Verification (end-to-end)

Run from repo root:

```
# local dev server
cd packages/worker && bun run dev   # wrangler dev on :8787

# in a second terminal:
# 1. streaming smoke
curl -N -X POST http://127.0.0.1:8787/api/chat/stream \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"find me safe USDC vaults on Base"}]}'
# expect: event: iteration / text_delta / tool_use_start / tool_result / done frames

# 2. goal planning smoke
curl -X POST http://127.0.0.1:8787/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"I want to save $500 by December 2026, I have $200 now"}]}'
# expect: toolCalls contains plan_goal first, then discover_vaults with risk_tier matching plan_goal's output

# 3. edge case: deadline already met
curl -X POST http://127.0.0.1:8787/api/chat \
  -d '{"messages":[{"role":"user","content":"I want $1000 by 2027, I already have $5000"}]}'
# expect: plan_goal returns feasibility="already_met"

# 4. full deposit simulation
cd tools/smoke-deposit && bun run smoke
# expect: OK simulated; gasLimit=0x... returnData=0x...

# 5. prod re-verify (once cert lands)
WORKER=https://earnie-worker.aritrac1998.workers.dev
curl $WORKER/api/health
curl "$WORKER/api/vaults?tag=stablecoin&minApy=5"
curl -X POST $WORKER/api/chat -d '{"messages":[{"role":"user","content":"save $500 by December, I have $200"}]}'
curl -N -X POST $WORKER/api/chat/stream -d '{"messages":[{"role":"user","content":"find me safe USDC vaults on Base"}]}'

# 6. build sanity
cd packages/worker && bun run build  # type-check worker
vp check                              # format + lint + tsc across monorepo
```

**Exit criteria:** all six verification blocks green. Streaming frames arrive incrementally (not batched). `plan_goal` fires before `discover_vaults` on goal-framed prompts. `bun run smoke` produces a PASS line for the agent's free-choice vault.

## Time budget

| Task                              | Est       |
| --------------------------------- | --------- |
| 2.3 Smoke deposit script          | 2.0h      |
| 2.2 `plan_goal` tool + math       | 1.5h      |
| 2.1 SSE streaming refactor        | 2.0h      |
| 2.4 Hygiene + master-plan rewrite | 0.5h      |
| 2.5 Prod verify                   | 0.5h      |
| **Total**                         | **~6.5h** |
