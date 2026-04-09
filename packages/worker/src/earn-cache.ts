import { VaultListResponseSchema } from "shared";
import type { Vault, VaultFilterParams } from "shared";
import { getRiskTier } from "shared";
import type { Env } from "./index.ts";

const CACHE_KEY = "vaults:all";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes soft TTL
const KV_EXPIRATION_TTL = 3600; // 1 hour hard expiry

interface CachedData {
  vaults: Vault[];
  cachedAt: number;
}

export async function getVaults(
  env: Env,
  ctx: ExecutionContext,
  filters?: VaultFilterParams,
): Promise<Vault[]> {
  const cached = await env.VAULT_CACHE.get<CachedData>(CACHE_KEY, { type: "json" });

  if (cached) {
    const age = Date.now() - cached.cachedAt;
    if (age > CACHE_TTL_MS) {
      // Stale — return immediately but refresh in background
      ctx.waitUntil(refreshCache(env));
    }
    return filters ? filterVaults(cached.vaults, filters) : cached.vaults;
  }

  // Cache miss — fetch synchronously
  const vaults = await fetchAllVaults(env);
  await storeCache(env, vaults);
  return filters ? filterVaults(vaults, filters) : vaults;
}

async function refreshCache(env: Env): Promise<void> {
  try {
    const vaults = await fetchAllVaults(env);
    await storeCache(env, vaults);
  } catch (e) {
    console.error("Background cache refresh failed:", e);
  }
}

async function storeCache(env: Env, vaults: Vault[]): Promise<void> {
  const data: CachedData = { vaults, cachedAt: Date.now() };
  await env.VAULT_CACHE.put(CACHE_KEY, JSON.stringify(data), {
    expirationTtl: KV_EXPIRATION_TTL,
  });
}

async function fetchAllVaults(env: Env): Promise<Vault[]> {
  const allVaults: Vault[] = [];
  let cursor: string | null = null;

  do {
    const url = new URL(`${env.EARN_API_BASE}/v1/earn/vaults`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Earn API error (${res.status}): ${await res.text()}`);
    }

    const json = await res.json();
    const parsed = VaultListResponseSchema.parse(json);
    allVaults.push(...parsed.data);
    cursor = parsed.nextCursor;
  } while (cursor);

  return allVaults;
}

export function filterVaults(vaults: Vault[], params: VaultFilterParams): Vault[] {
  let result = vaults;

  if (params.tag) {
    const tag = params.tag.toLowerCase();
    result = result.filter((v) => v.tags.some((t) => t.toLowerCase() === tag));
  }
  if (params.chainId != null) {
    result = result.filter((v) => v.chainId === params.chainId);
  }
  if (params.asset) {
    const asset = params.asset.toUpperCase();
    result = result.filter((v) => v.underlyingTokens.some((t) => t.symbol.toUpperCase() === asset));
  }
  if (params.minApy != null) {
    result = result.filter((v) => v.analytics.apy.total >= params.minApy!);
  }
  if (params.minTvl != null) {
    result = result.filter((v) => Number(v.analytics.tvl.usd) >= params.minTvl!);
  }
  if (params.riskTier) {
    result = result.filter((v) => getRiskTier(v) === params.riskTier);
  }

  return result;
}

export function sortVaults(vaults: Vault[], sortBy: "apy" | "tvl"): Vault[] {
  return [...vaults].sort((a, b) => {
    if (sortBy === "apy") return b.analytics.apy.total - a.analytics.apy.total;
    return Number(b.analytics.tvl.usd) - Number(a.analytics.tvl.usd);
  });
}
