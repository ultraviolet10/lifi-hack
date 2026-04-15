import { Link } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { usePortfolio } from "../hooks/usePortfolio.ts";
import { PositionCard } from "../components/PositionCard.tsx";

export function Portfolio() {
  const { user } = usePrivy();
  const address = user?.wallet?.address;
  const { data, isLoading, error } = usePortfolio(address);

  const total = data?.positions.reduce((sum, p) => sum + (p.balanceUsd ?? 0), 0) ?? 0;

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <header className="mb-8">
        <div className="text-sm text-zinc-400">Total balance</div>
        <div className="text-5xl font-semibold tabular-nums mt-1">${total.toFixed(2)}</div>
        {address && (
          <div className="text-xs text-zinc-500 mt-2 font-mono">
            {address.slice(0, 6)}…{address.slice(-4)}
          </div>
        )}
      </header>

      {isLoading && <div className="text-zinc-400">Loading positions…</div>}
      {error && <div className="text-red-400">Failed to load portfolio</div>}

      {data && data.positions.length === 0 && (
        <div className="rounded-2xl bg-(--color-surface) border border-white/5 p-8 text-center">
          <div className="text-lg font-medium mb-1">No positions yet</div>
          <div className="text-sm text-zinc-400 mb-5">Start earning by picking a vault.</div>
          <Link
            to="/discover"
            className="inline-block px-6 py-2.5 rounded-xl bg-(--color-brand) font-medium"
          >
            Go to Discover
          </Link>
        </div>
      )}

      {data && data.positions.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.positions.map((p, i) => (
            <PositionCard key={`${p.chainId}-${p.asset.address}-${i}`} position={p} />
          ))}
        </div>
      )}
    </div>
  );
}
