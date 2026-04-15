import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";
import type { PortfolioPosition, Vault } from "shared";
import { usePortfolio } from "../hooks/usePortfolio.ts";
import { useVaults } from "../hooks/useVaults.ts";
import { EarniePositionCard } from "./EarniePositionCard.tsx";
import { YieldBalance } from "./YieldBalance.tsx";
import { formatCompactUsd, formatPct, relativeTime } from "../lib/format.ts";
import { mockYieldUsd } from "../lib/mockYield.ts";

type Props = { open: boolean; onClose: () => void };

type MatchedPosition = PortfolioPosition & { vault: Vault };

function hasVault(p: PortfolioPosition): p is MatchedPosition {
  return !!p.vault;
}

export function EarnieSheet({ open, onClose }: Props) {
  const { address } = useAccount();
  const portfolio = usePortfolio(address);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const positions = portfolio.data?.positions ?? [];
  const matched = useMemo(
    () => positions.filter(hasVault).sort((a, b) => b.balanceUsd - a.balanceUsd),
    [positions],
  );
  const hiddenCount = positions.length - matched.length;

  const principal = matched.reduce((s, p) => s + p.balanceUsd, 0);
  const yieldUsd = matched.reduce((s, p) => s + mockYieldUsd(p), 0);

  const newestUpdate = matched.reduce<string | null>((acc, p) => {
    const u = p.vault.analytics.updatedAt;
    return !acc || u > acc ? u : acc;
  }, null);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 flex h-[75vh] animate-[sheet-up_240ms_ease-out] flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-zinc-950 text-white shadow-2xl motion-reduce:animate-none"
      >
        <div className="flex justify-center pt-3">
          <div className="h-1.5 w-10 rounded-full bg-zinc-700" />
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
          {portfolio.isLoading ? (
            <LoadingState />
          ) : portfolio.isError ? (
            <ErrorState onRetry={() => portfolio.refetch()} />
          ) : matched.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="mb-6">
                <p className="mb-2 text-sm text-zinc-500">Your capital</p>
                <YieldBalance principal={principal} yieldAmount={yieldUsd} />
                <p className="mt-3 text-sm text-zinc-400">
                  Working across <span className="text-white">{matched.length}</span> vault
                  {matched.length === 1 ? "" : "s"}. Yield shown is an estimate.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {matched.map((p) => (
                  <EarniePositionCard key={`${p.chainId}-${p.asset.address}`} position={p} />
                ))}
              </div>

              {hiddenCount > 0 && (
                <p className="mt-4 text-center text-xs text-zinc-600">
                  {hiddenCount} position{hiddenCount === 1 ? "" : "s"} hidden — protocol not
                  recognised
                </p>
              )}
            </>
          )}
        </div>

        <div className="border-t border-white/5 px-6 py-3 text-[11px] text-zinc-500">
          {newestUpdate ? `Updated ${relativeTime(newestUpdate)} · ` : ""}Powered by LI.FI
        </div>
      </div>

      <style>{`
        @keyframes sheet-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body,
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-3">
      <div className="mb-4 h-16 w-48 animate-pulse rounded-xl bg-zinc-900" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-zinc-900" />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-zinc-300">Couldn't load your positions.</p>
      <button onClick={onRetry} className="rounded-full bg-white px-4 py-2 text-sm text-black">
        Retry
      </button>
    </div>
  );
}

function EmptyState() {
  const { data } = useVaults({ sortBy: "apy", riskTier: "safe", asset: "USDC" });
  const suggestions = (data?.data ?? []).slice(0, 3);

  return (
    <div>
      <p className="mb-1 text-sm text-zinc-500">Your capital</p>
      <h2 className="mb-2 text-2xl font-semibold text-white">
        Earnie hasn't deployed your funds yet.
      </h2>
      <p className="mb-6 text-sm text-zinc-400">
        Here are a few safe USDC vaults you could start with.
      </p>
      <div className="flex flex-col gap-3">
        {suggestions.map((v) => (
          <a
            key={v.slug}
            href={v.protocol.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-2xl border border-white/5 bg-zinc-900/60 p-4 transition hover:border-emerald-500/40"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-white">
                {v.protocol.name}
                <span className="ml-2 text-xs text-zinc-500">· {v.network}</span>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500">
                TVL {formatCompactUsd(Number(v.analytics.tvl.usd))}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg font-semibold text-emerald-300">
                {formatPct(v.analytics.apy.total)}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">APY</div>
            </div>
          </a>
        ))}
        {suggestions.length === 0 && <p className="text-sm text-zinc-500">Loading suggestions…</p>}
      </div>
    </div>
  );
}
