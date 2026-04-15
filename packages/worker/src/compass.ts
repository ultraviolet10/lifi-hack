import Anthropic from "@anthropic-ai/sdk";
import { getRiskTier, CompassResponseSchema } from "shared";
import type { Vault, CompassDirection, CompassPick, CompassResponse, CompassRequest } from "shared";
import { getVaults } from "./earn-cache.ts";
import type { Env } from "./index.ts";

const COMPASS_CACHE_TTL = 3600;

type Bucket = Record<CompassDirection, Vault[]>;

function strategyType(v: Vault): "passive" | "active" {
  const tags = v.tags.map((t) => t.toLowerCase());
  if (tags.some((t) => t === "lp" || t === "amm" || t === "il-risk")) return "active";
  return "passive";
}

function direction(v: Vault): CompassDirection {
  const risk = getRiskTier(v);
  const strat = strategyType(v);
  const highRisk = risk === "bold";
  if (!highRisk && strat === "passive") return "safe";
  if (!highRisk && strat === "active") return "growth";
  if (highRisk && strat === "active") return "bold";
  return "wild";
}

function bucket(vaults: Vault[]): Bucket {
  const b: Bucket = { safe: [], growth: [], bold: [], wild: [] };
  for (const v of vaults) b[direction(v)].push(v);
  for (const k of Object.keys(b) as CompassDirection[]) {
    b[k].sort((a, z) => (z.analytics.apy.total ?? 0) - (a.analytics.apy.total ?? 0));
  }
  return b;
}

function templatedRationale(v: Vault, dir: CompassDirection): string {
  const apy = v.analytics.apy.total != null ? `${v.analytics.apy.total.toFixed(1)}%` : "variable";
  const pitch: Record<CompassDirection, string> = {
    safe: `Park-and-forget on ${v.protocol.name}, earning ${apy}.`,
    growth: `${v.protocol.name} LP at ${apy} — modest risk, real upside.`,
    bold: `High-octane ${v.protocol.name} pool at ${apy}. IL risk, bigger rewards.`,
    wild: `Wildcard: ${v.protocol.name} at ${apy}. Small bet, large surprise.`,
  };
  return pitch[dir];
}

function fallback(b: Bucket): CompassPick[] {
  const picks: CompassPick[] = [];
  for (const dir of ["safe", "growth", "bold", "wild"] as CompassDirection[]) {
    const top = b[dir].slice(0, 2);
    for (const v of top) {
      picks.push({ direction: dir, vaultSlug: v.slug, rationale: templatedRationale(v, dir) });
    }
  }
  return picks;
}

async function llmPicks(
  b: Bucket,
  asset: string | undefined,
  apiKey: string,
): Promise<CompassPick[] | null> {
  const candidates: Record<
    CompassDirection,
    Array<{ slug: string; protocol: string; apy: number | null; tvl: string; tags: string[] }>
  > = {
    safe: [],
    growth: [],
    bold: [],
    wild: [],
  };
  for (const dir of Object.keys(b) as CompassDirection[]) {
    candidates[dir] = b[dir].slice(0, 8).map((v) => ({
      slug: v.slug,
      protocol: v.protocol.name,
      apy: v.analytics.apy.total,
      tvl: v.analytics.tvl.usd,
      tags: v.tags,
    }));
  }

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system:
      "You are Earnie, a playful DeFi yield guide. You pick 2 vaults per compass direction to help new users explore the yield landscape. Write rationale in <=140 chars, warm, concrete, never generic.",
    tools: [
      {
        name: "return_compass",
        description: "Return exactly 2 vault picks per direction (safe/growth/bold/wild).",
        input_schema: {
          type: "object",
          properties: {
            picks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  direction: { type: "string", enum: ["safe", "growth", "bold", "wild"] },
                  vaultSlug: { type: "string" },
                  rationale: { type: "string" },
                },
                required: ["direction", "vaultSlug", "rationale"],
              },
            },
          },
          required: ["picks"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "return_compass" },
    messages: [
      {
        role: "user",
        content: `Asset: ${asset ?? "any"}.\nCandidates by bucket (top by APY):\n${JSON.stringify(candidates, null, 2)}\n\nPick exactly 2 per direction. Prefer diversity of protocols. Rationale must be specific to the vault (mention protocol + why it fits its direction).`,
      },
    ],
  });

  const toolUse = res.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") return null;
  const input = toolUse.input as { picks?: CompassPick[] };
  if (!Array.isArray(input.picks) || input.picks.length !== 8) return null;

  const validSlugs = new Set(
    Object.values(b)
      .flat()
      .map((v) => v.slug),
  );
  const clean = input.picks.filter((p) => validSlugs.has(p.vaultSlug));
  if (clean.length !== 8) return null;
  return clean;
}

export async function handleCompass(
  req: CompassRequest,
  env: Env,
  ctx: ExecutionContext,
): Promise<CompassResponse> {
  const cacheKey = `compass:${req.userAddress?.toLowerCase() ?? "anon"}:${req.asset ?? "any"}`;
  const cached = await env.VAULT_CACHE.get<CompassResponse>(cacheKey, { type: "json" });
  if (cached) return cached;

  const allVaults = await getVaults(env, ctx);
  const filtered = req.asset
    ? allVaults.filter((v) =>
        v.underlyingTokens.some((t) => t.symbol.toUpperCase() === req.asset!.toUpperCase()),
      )
    : allVaults;
  const b = bucket(filtered);

  const short = (["safe", "growth", "bold", "wild"] as CompassDirection[]).some(
    (d) => b[d].length < 2,
  );
  if (short) {
    for (const d of ["safe", "growth", "bold", "wild"] as CompassDirection[]) {
      if (b[d].length < 2) {
        const need = 2 - b[d].length;
        const extras = bucket(allVaults)[d].slice(0, need + b[d].length);
        b[d] = [...new Set([...b[d], ...extras])];
      }
    }
  }

  let picks = await llmPicks(b, req.asset, env.CLAUDE_API_KEY).catch((e) => {
    console.error("compass LLM failed:", e);
    return null;
  });
  if (!picks) picks = fallback(b);

  const response: CompassResponse = {
    picks,
    axes: { y: "risk", x: "strategy" },
    generatedAt: new Date().toISOString(),
  };
  const validated = CompassResponseSchema.parse(response);

  await env.VAULT_CACHE.put(cacheKey, JSON.stringify(validated), {
    expirationTtl: COMPASS_CACHE_TTL,
  });
  return validated;
}
