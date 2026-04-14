import Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent, AgentRequest, AgentResponse, ToolCallRecord } from "shared";
import { getRiskTier } from "shared";
import { getVaults, filterVaults, sortVaults } from "./earn-cache.ts";
import { getQuote } from "./composer.ts";
import { planGoal, type PlanGoalInput } from "./goal.ts";
import type { Env } from "./index.ts";

const SYSTEM_PROMPT = `You are Earnie, a friendly and knowledgeable DeFi yield assistant powered by LI.FI.
Help users find the best yield vaults, understand risks, and deposit into vaults.
Use tools to get real data — never make up numbers or vault names.
Explain in simple terms. When recommending vaults, always mention: name, protocol, APY, TVL, and risk tier (safe/growth/bold).
If the user wants to deposit, use build_deposit_tx to generate the transaction.
Be concise but helpful.

Common token addresses (use these for from_token in build_deposit_tx):
- USDC on Ethereum (chainId 1): 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
- USDT on Ethereum (chainId 1): 0xdAC17F958D2ee523a2206206994597C13D831ec7
- DAI on Ethereum (chainId 1): 0x6B175474E89094C44Da98b954EedeAC495271d0F
- WETH on Ethereum (chainId 1): 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
- ETH (native): 0x0000000000000000000000000000000000000000
- USDC on Arbitrum (chainId 42161): 0xaf88d065e77c8cC2239327C5EDb3A432268e5831
- USDC on Optimism (chainId 10): 0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85
- USDC on Base (chainId 8453): 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- USDC on Polygon (chainId 137): 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359

When building a deposit tx, use the vault's chainId as both from_chain_id and vault_chain_id for same-chain deposits. Convert human-readable amounts to smallest unit (e.g., 100 USDC = "100000000" for 6 decimals, 1 ETH = "1000000000000000000" for 18 decimals).

When the user mentions both a target USD amount AND a deadline (e.g. "save $500 by December", "$50k in 3 years"), call plan_goal FIRST to get the required monthly contribution and suggested risk tier, THEN call discover_vaults passing that risk_tier. Quote the monthly contribution number in your final reply.`;

const MAX_TOOL_ITERATIONS = 5;

const tools: Anthropic.Tool[] = [
  {
    name: "discover_vaults",
    description:
      "Search for yield vaults matching criteria. Returns top results with APY, TVL, risk tier, address, and network.",
    input_schema: {
      type: "object" as const,
      properties: {
        asset: {
          type: "string",
          description: "Token symbol to search for (e.g., USDC, ETH, WBTC)",
        },
        risk_tier: {
          type: "string",
          enum: ["safe", "growth", "bold"],
          description: "Risk preference",
        },
        min_apy: { type: "number", description: "Minimum APY percentage" },
        chain: {
          type: "string",
          description: "Chain name or 'any' for all chains",
        },
        sort_by: {
          type: "string",
          enum: ["apy", "tvl"],
          description: "Sort results by APY or TVL",
        },
      },
    },
  },
  {
    name: "get_vault_detail",
    description: "Get detailed info about a specific vault by network and address.",
    input_schema: {
      type: "object" as const,
      properties: {
        network: {
          type: "string",
          description: "Network name (e.g., ethereum, arbitrum)",
        },
        address: {
          type: "string",
          description: "Vault contract address",
        },
      },
      required: ["network", "address"],
    },
  },
  {
    name: "get_portfolio",
    description: "Get all DeFi yield positions for a wallet address.",
    input_schema: {
      type: "object" as const,
      properties: {
        address: {
          type: "string",
          description: "Wallet address (0x...)",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "build_deposit_tx",
    description:
      "Build a deposit transaction to enter a vault. Returns transaction data the user can sign and submit.",
    input_schema: {
      type: "object" as const,
      properties: {
        vault_address: {
          type: "string",
          description: "Vault contract address (the destination token)",
        },
        vault_chain_id: {
          type: "number",
          description: "Chain ID of the vault",
        },
        from_token: {
          type: "string",
          description: "Source token address to deposit",
        },
        from_chain_id: {
          type: "number",
          description: "Chain ID of the source token (defaults to vault chain if omitted)",
        },
        amount: {
          type: "string",
          description: "Amount in smallest unit (wei)",
        },
        user_address: {
          type: "string",
          description: "User's wallet address",
        },
      },
      required: ["vault_address", "vault_chain_id", "from_token", "amount", "user_address"],
    },
  },
  {
    name: "plan_goal",
    description:
      "Decompose a savings goal into a required monthly contribution and a suggested risk tier. Call this FIRST whenever the user mentions both a target amount and a deadline (e.g. 'save $500 by December'), BEFORE calling discover_vaults. Then pass the returned riskTier into discover_vaults as risk_tier.",
    input_schema: {
      type: "object" as const,
      properties: {
        target_amount_usd: {
          type: "number",
          description: "Final target amount in USD",
        },
        deadline_iso: {
          type: "string",
          description: "Target date in YYYY-MM-DD format",
        },
        current_principal_usd: {
          type: "number",
          description: "USD the user already has saved; defaults to 0",
        },
        risk_preference: {
          type: "string",
          enum: ["safe", "growth", "bold", "auto"],
          description:
            "User's stated risk appetite; 'auto' picks by time horizon (≤12mo safe, ≤36mo growth, >36mo bold)",
        },
      },
      required: ["target_amount_usd", "deadline_iso"],
    },
  },
];

// Async generator that drives the Claude tool_use loop and yields AgentEvents.
// Consumed by both handleChat (non-streaming /api/chat) and the SSE route
// (/api/chat/stream) in index.ts. Never throws — errors yield an "error" event
// and return.
export async function* runAgentLoop(
  request: AgentRequest,
  env: Env,
  ctx: ExecutionContext,
  signal?: AbortSignal,
): AsyncGenerator<AgentEvent, void, void> {
  try {
    const client = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
    const toolCallLog: ToolCallRecord[] = [];

    const messages: Anthropic.MessageParam[] = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Known issue (day_2.md): injects at [0] regardless of multi-turn position.
    if (request.userAddress && messages.length > 0) {
      messages[0] = {
        ...messages[0],
        content: `[User wallet: ${request.userAddress}]\n\n${messages[0].content as string}`,
      };
    }

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      yield { type: "iteration", index: i };

      const stream = client.messages.stream(
        {
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages,
          tools,
        },
        { signal },
      );

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text_delta", delta: event.delta.text };
        }
      }

      const final = await stream.finalMessage();

      if (final.stop_reason === "end_turn") {
        const reply = final.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        yield {
          type: "done",
          reply,
          toolCalls: toolCallLog.length > 0 ? toolCallLog : undefined,
        };
        return;
      }

      if (final.stop_reason !== "tool_use") continue;

      const toolUseBlocks = final.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      messages.push({ role: "assistant", content: final.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        yield {
          type: "tool_use_start",
          id: block.id,
          name: block.name,
          input: block.input,
        };

        let output: unknown;
        try {
          output = await executeTool(block.name, block.input as Record<string, unknown>, env, ctx);
        } catch (e) {
          output = { error: e instanceof Error ? e.message : String(e) };
        }

        toolCallLog.push({ name: block.name, input: block.input, output });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });

        const ok = !(output !== null && typeof output === "object" && "error" in output);
        yield {
          type: "tool_result",
          id: block.id,
          name: block.name,
          ok,
          summary: JSON.stringify(output).slice(0, 400),
        };
      }

      messages.push({ role: "user", content: toolResults });
    }

    yield {
      type: "done",
      reply: "I'm still working on that — could you try simplifying your question?",
      toolCalls: toolCallLog.length > 0 ? toolCallLog : undefined,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const where: "abort" | "model" = signal?.aborted || /abort/i.test(message) ? "abort" : "model";
    yield { type: "error", message, where };
  }
}

export async function handleChat(
  request: AgentRequest,
  env: Env,
  ctx: ExecutionContext,
): Promise<AgentResponse> {
  let reply = "";
  let toolCalls: ToolCallRecord[] | undefined;
  let errorMsg: string | undefined;

  for await (const ev of runAgentLoop(request, env, ctx)) {
    if (ev.type === "done") {
      reply = ev.reply;
      toolCalls = ev.toolCalls;
    } else if (ev.type === "error") {
      errorMsg = ev.message;
    }
  }

  if (errorMsg) throw new Error(errorMsg);
  return { reply, toolCalls };
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  env: Env,
  ctx: ExecutionContext,
): Promise<unknown> {
  switch (name) {
    case "discover_vaults": {
      const allVaults = await getVaults(env, ctx);
      let filtered = filterVaults(allVaults, {
        asset: input.asset as string | undefined,
        riskTier: input.risk_tier as "safe" | "growth" | "bold" | undefined,
        minApy: input.min_apy as number | undefined,
      });
      const sortBy = (input.sort_by as "apy" | "tvl") ?? "apy";
      filtered = sortVaults(filtered, sortBy);

      // Return top 5 with essential fields
      return filtered.slice(0, 5).map((v) => ({
        name: v.name,
        slug: v.slug,
        protocol: v.protocol.name,
        network: v.network,
        address: v.address,
        chainId: v.chainId,
        apy: `${(v.analytics.apy.total ?? 0).toFixed(2)}%`,
        tvl: `$${Number(v.analytics.tvl.usd).toLocaleString()}`,
        riskTier: getRiskTier(v),
        underlyingTokens: v.underlyingTokens.map((t) => t.symbol).join(", "),
        isTransactional: v.isTransactional,
      }));
    }

    case "get_vault_detail": {
      const network = input.network as string;
      const address = input.address as string;
      const res = await fetch(`${env.EARN_API_BASE}/v1/earn/vaults/${network}/${address}`);
      if (!res.ok) return { error: `Vault not found (${res.status})` };
      return res.json();
    }

    case "get_portfolio": {
      const addr = input.address as string;
      const res = await fetch(`${env.EARN_API_BASE}/v1/earn/portfolio/${addr}/positions`);
      if (!res.ok) return { error: `Portfolio fetch failed (${res.status})` };
      return res.json();
    }

    case "plan_goal": {
      return planGoal(input as unknown as PlanGoalInput);
    }

    case "build_deposit_tx": {
      try {
        const vaultChainId = input.vault_chain_id as number;
        const fromChainId = (input.from_chain_id as number) ?? vaultChainId;
        const quote = await getQuote(
          {
            fromChain: String(fromChainId),
            toChain: String(vaultChainId),
            fromToken: input.from_token as string,
            toToken: input.vault_address as string,
            fromAddress: input.user_address as string,
            toAddress: input.user_address as string,
            fromAmount: input.amount as string,
          },
          env,
        );
        return quote;
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Quote failed" };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
