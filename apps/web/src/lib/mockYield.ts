import type { PortfolioPosition } from "shared";

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mockYieldPct(p: PortfolioPosition): number {
  const key = p.vaultSlug ?? `${p.chainId}-${p.asset.address}`;
  const pct = 2 + (hashString(key) % 2300) / 100;
  return pct;
}

export function mockYieldUsd(p: PortfolioPosition): number {
  return (p.balanceUsd * mockYieldPct(p)) / 100;
}
