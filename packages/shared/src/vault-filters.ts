import type { Vault } from "./earn-types.ts";

export type RiskTier = "safe" | "growth" | "bold";

export interface VaultFilterParams {
  tag?: string;
  chainId?: number;
  asset?: string;
  minApy?: number;
  minTvl?: number;
  sortBy?: "apy" | "tvl" | "risk";
  riskTier?: RiskTier;
}

export function getRiskTier(vault: Vault): RiskTier {
  const tvl = Number(vault.analytics.tvl.usd);
  const hasStablecoinTag = vault.tags.includes("stablecoin");
  const hasILRisk = vault.tags.includes("il-risk");
  const apy = vault.analytics.apy.total;

  if (hasStablecoinTag && tvl > 10_000_000 && apy < 15) return "safe";
  if (hasILRisk || apy > 30) return "bold";
  return "growth";
}
