import { getRiskTier } from "shared";
import type { Vault, RiskTier } from "shared";

export { getRiskTier };

export function rankVaults(
  vaults: Vault[],
  criteria?: { apyWeight?: number; tvlWeight?: number },
): Vault[] {
  const w = { apy: criteria?.apyWeight ?? 0.6, tvl: criteria?.tvlWeight ?? 0.4 };
  const maxApy = Math.max(...vaults.map((v) => v.analytics.apy.total ?? 0), 1);
  const maxTvl = Math.max(...vaults.map((v) => Number(v.analytics.tvl.usd)), 1);

  return [...vaults].sort((a, b) => {
    const scoreA =
      ((a.analytics.apy.total ?? 0) / maxApy) * w.apy +
      (Number(a.analytics.tvl.usd) / maxTvl) * w.tvl;
    const scoreB =
      ((b.analytics.apy.total ?? 0) / maxApy) * w.apy +
      (Number(b.analytics.tvl.usd) / maxTvl) * w.tvl;
    return scoreB - scoreA;
  });
}

export function categorizeByTier(vaults: Vault[]): Record<RiskTier, Vault[]> {
  const result: Record<RiskTier, Vault[]> = { safe: [], growth: [], bold: [] };
  for (const v of vaults) {
    result[getRiskTier(v)].push(v);
  }
  return result;
}
