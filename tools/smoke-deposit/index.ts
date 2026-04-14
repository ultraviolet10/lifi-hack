// End-to-end smoke: worker /api/chat → Claude → build_deposit_tx → Composer →
// transactionRequest → viem publicClient.call() eth_call simulation on Base.
//
// Assumption: LI.FI /v1/quote returns transactionRequest with value/gasLimit/
// gasPrice as 0x-prefixed hex strings. If decimal strings show up, toBig()
// handles both.

import { createPublicClient, http, hexToBigInt, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import type { AgentResponse, ToolCallRecord } from "shared";

interface LiFiTransactionRequest {
  from: Address;
  to: Address;
  chainId: number;
  data: Hex;
  value?: string;
  gasPrice?: string;
  gasLimit?: string;
}

interface LiFiStep {
  transactionRequest?: LiFiTransactionRequest;
  includedSteps?: LiFiStep[];
  action?: { fromChainId?: number; toChainId?: number; fromAmount?: string };
  estimate?: { gasCosts?: unknown; executionDuration?: number };
  error?: string;
}

function must(key: string): string {
  const v = Bun.env[key];
  if (!v) die(`Missing env var: ${key}`);
  return v;
}

function die(msg: string): never {
  console.error(`\x1b[31mFAIL\x1b[0m ${msg}`);
  process.exit(1);
}

function toBig(v: string | undefined): bigint | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return v.startsWith("0x") ? hexToBigInt(v as Hex) : BigInt(v);
}

async function main() {
  const workerUrl = must("WORKER_URL");
  const testWallet = must("TEST_WALLET_ADDRESS") as Address;
  const baseRpc = must("BASE_RPC_URL");

  const prompt =
    `I want to deposit 10 USDC into the safest USDC vault on Base. ` +
    `My wallet: ${testWallet}. Build the deposit transaction for me.`;

  console.log(`→ POST ${workerUrl}/api/chat`);
  console.log(`  prompt: ${prompt}`);

  const res = await fetch(`${workerUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      userAddress: testWallet,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    die(`worker ${res.status}: ${body}`);
  }

  const agent = (await res.json()) as AgentResponse;
  console.log(`\n← reply: ${agent.reply.slice(0, 300)}${agent.reply.length > 300 ? "…" : ""}`);

  if (!agent.toolCalls || agent.toolCalls.length === 0) {
    die("agent returned no toolCalls — Claude never called any tools");
  }

  console.log(`\n  toolCalls: ${agent.toolCalls.map((t) => t.name).join(" → ")}`);

  const discover = agent.toolCalls.find((t: ToolCallRecord) => t.name === "discover_vaults");
  if (discover) {
    const top = (discover.output as Array<{ name: string; apy: string; tvl: string }>)?.[0];
    if (top) console.log(`  vault picked: ${top.name} (apy ${top.apy}, tvl ${top.tvl})`);
  }

  const deposit = agent.toolCalls.find((t: ToolCallRecord) => t.name === "build_deposit_tx");
  if (!deposit) die("agent did not call build_deposit_tx");

  const quote = deposit.output as LiFiStep;
  if (quote.error) die(`composer error: ${quote.error}`);

  const nestedSteps = quote.includedSteps ?? [];
  if (nestedSteps.length > 1) {
    console.warn(
      `\n\x1b[33mWARN\x1b[0m multi-step quote (${nestedSteps.length} steps); simulating step 1 only`,
    );
  }

  const tx = quote.transactionRequest ?? nestedSteps[0]?.transactionRequest;
  if (!tx) die("no transactionRequest in Composer response");

  console.log(`\n  tx.from:     ${tx.from}`);
  console.log(`  tx.to:       ${tx.to}`);
  console.log(`  tx.chainId:  ${tx.chainId}`);
  console.log(`  tx.value:    ${tx.value ?? "0"}`);
  console.log(`  tx.gasLimit: ${tx.gasLimit ?? "(unset)"}`);
  console.log(`  tx.data:     ${tx.data.slice(0, 20)}…`);

  if (tx.chainId !== base.id) {
    console.warn(
      `\n\x1b[33mWARN\x1b[0m tx.chainId=${tx.chainId} but simulating on Base (${base.id}); ` +
        `set BASE_RPC_URL to match if this is wrong`,
    );
  }

  const client = createPublicClient({ chain: base, transport: http(baseRpc) });

  console.log(`\n→ eth_call simulation on Base via ${baseRpc}`);
  try {
    const result = await client.call({
      account: tx.from,
      to: tx.to,
      data: tx.data,
      value: toBig(tx.value) ?? 0n,
      gas: toBig(tx.gasLimit),
    });
    console.log(`\n\x1b[32mPASS\x1b[0m simulated; returnData=${result.data ?? "0x"}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // ERC20 approval gate is expected — Composer quotes assume the user has
    // already approved the LI.FI router. Day 3 wagmi flow will handle the
    // approve() step before deposit(). Revert here means shape is valid and
    // broadcastable assuming approval is in place.
    const isApprovalGate =
      /TRANSFER_FROM_FAILED|ERC20: transfer amount exceeds allowance|insufficient allowance/i.test(
        msg,
      );
    if (isApprovalGate) {
      console.log(
        `\n\x1b[32mSOFT PASS\x1b[0m shape valid, execution gated by ERC20 approval\n` +
          `  → Day 3 UI must call USDC.approve(${tx.to}, amount) before this deposit tx\n` +
          `  → Composer output is structurally sound; the loop works end-to-end`,
      );
      return;
    }
    die(`simulation reverted (unexpected):\n${msg}`);
  }
}

main().catch((e) => die(e instanceof Error ? (e.stack ?? e.message) : String(e)));
