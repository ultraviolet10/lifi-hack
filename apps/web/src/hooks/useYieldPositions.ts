import { useMemo } from "react";
import type { PortfolioPosition, Vault } from "shared";
import { usePortfolio } from "./usePortfolio.ts";

export type MatchedPosition = PortfolioPosition & { vault: Vault };

export interface YieldPositionsView {
  matched: MatchedPosition[];
  unmatched: PortfolioPosition[];
  totalUsd: number;
  matchedUsd: number;
  unmatchedUsd: number;
  byChain: Record<number, MatchedPosition[]>;
  byProtocol: Record<string, MatchedPosition[]>;
  weightedApy: number | null;
  newestUpdatedAt: string | null;
}

function hasVault(p: PortfolioPosition): p is MatchedPosition {
  return !!p.vault;
}

export function isUnderlyingSymbol(p: MatchedPosition, symbol: string): boolean {
  const s = symbol.toUpperCase();
  return p.vault.underlyingTokens.some((t) => t.symbol.toUpperCase() === s);
}

// USDC ≈ $1. Upstream portfolio pricing sometimes returns 0 for fresh small
// deposits; fall back to balanceNative / 10^decimals for USDC-underlying positions.
export function usdcPositionUsd(p: MatchedPosition): number {
  if (p.balanceUsd > 0) return p.balanceUsd;
  try {
    const raw = BigInt(p.balanceNative || "0");
    return Number(raw) / 10 ** p.asset.decimals;
  } catch {
    return 0;
  }
}

function buildView(positions: PortfolioPosition[]): YieldPositionsView {
  const matched = positions.filter(hasVault).sort((a, b) => b.balanceUsd - a.balanceUsd);
  const unmatched = positions.filter((p) => !p.vault);

  const matchedUsd = matched.reduce((s, p) => s + p.balanceUsd, 0);
  const unmatchedUsd = unmatched.reduce((s, p) => s + p.balanceUsd, 0);
  const totalUsd = matchedUsd + unmatchedUsd;

  const byChain: Record<number, MatchedPosition[]> = {};
  const byProtocol: Record<string, MatchedPosition[]> = {};
  for (const p of matched) {
    (byChain[p.chainId] ??= []).push(p);
    (byProtocol[p.vault.protocol.name] ??= []).push(p);
  }

  let apyNum = 0;
  let apyDen = 0;
  let newestUpdatedAt: string | null = null;
  for (const p of matched) {
    const apy = p.vault.analytics.apy.total;
    if (apy != null && p.balanceUsd > 0) {
      apyNum += apy * p.balanceUsd;
      apyDen += p.balanceUsd;
    }
    const u = p.vault.analytics.updatedAt;
    if (!newestUpdatedAt || u > newestUpdatedAt) newestUpdatedAt = u;
  }
  const weightedApy = apyDen > 0 ? apyNum / apyDen : null;

  return {
    matched,
    unmatched,
    totalUsd,
    matchedUsd,
    unmatchedUsd,
    byChain,
    byProtocol,
    weightedApy,
    newestUpdatedAt,
  };
}

/**
 * Aggregated view over a user's yield-bearing positions, enriched with vault
 * metadata. Backed by usePortfolio — shares cache, refetch, and invalidation.
 */
export function useYieldPositions(address: string | undefined) {
  const q = usePortfolio(address);
  const positions = q.data?.positions ?? [];
  const view = useMemo(() => buildView(positions), [positions]);

  return {
    ...view,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
    dataUpdatedAt: q.dataUpdatedAt,
  };
}
