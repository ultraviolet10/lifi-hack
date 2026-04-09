import { Hono } from "hono";
import { cors } from "hono/cors";
import { getVaults, filterVaults, sortVaults } from "./earn-cache.ts";
import { handleChat } from "./agent.ts";
import { getQuote } from "./composer.ts";
import type { AgentRequest } from "shared";

export interface Env {
  CLAUDE_API_KEY: string;
  COMPOSER_API_KEY: string;
  VAULT_CACHE: KVNamespace;
  EARN_API_BASE: string;
  LIFI_API_BASE: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/api/health", async (c) => {
  let cachedVaults = 0;
  try {
    const cached = await c.env.VAULT_CACHE.get("vaults:all", { type: "json" });
    if (Array.isArray(cached)) cachedVaults = cached.length;
  } catch {
    // KV not available or empty
  }
  return c.json({ status: "ok", cached_vaults: cachedVaults, timestamp: new Date().toISOString() });
});

app.get("/api/vaults", async (c) => {
  const tag = c.req.query("tag");
  const chainId = c.req.query("chainId");
  const asset = c.req.query("asset");
  const minApy = c.req.query("minApy");
  const minTvl = c.req.query("minTvl");
  const sortBy = c.req.query("sortBy") as "apy" | "tvl" | undefined;
  const riskTier = c.req.query("riskTier") as "safe" | "growth" | "bold" | undefined;

  const allVaults = await getVaults(c.env, c.executionCtx);
  let vaults = filterVaults(allVaults, {
    tag: tag ?? undefined,
    chainId: chainId ? Number(chainId) : undefined,
    asset: asset ?? undefined,
    minApy: minApy ? Number(minApy) : undefined,
    minTvl: minTvl ? Number(minTvl) : undefined,
    riskTier,
  });
  if (sortBy) vaults = sortVaults(vaults, sortBy);

  return c.json({ data: vaults, total: vaults.length });
});

app.get("/api/vaults/:slug", async (c) => {
  const slug = c.req.param("slug");
  const allVaults = await getVaults(c.env, c.executionCtx);
  const vault = allVaults.find((v) => v.slug === slug);
  if (!vault) return c.json({ error: "Vault not found" }, 404);
  return c.json(vault);
});

app.post("/api/chat", async (c) => {
  const body = await c.req.json<AgentRequest>();
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return c.json({ error: "messages array is required" }, 400);
  }
  const response = await handleChat(body, c.env, c.executionCtx);
  return c.json(response);
});

app.get("/api/quote", async (c) => {
  const params = {
    fromChain: c.req.query("fromChain") ?? "",
    toChain: c.req.query("toChain") ?? "",
    fromToken: c.req.query("fromToken") ?? "",
    toToken: c.req.query("toToken") ?? "",
    fromAddress: c.req.query("fromAddress") ?? "",
    toAddress: c.req.query("toAddress"),
    fromAmount: c.req.query("fromAmount") ?? "",
  };
  const quote = await getQuote(params, c.env);
  return c.json(quote);
});

export default app;
