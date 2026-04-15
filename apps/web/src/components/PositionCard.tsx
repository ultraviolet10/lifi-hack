import type { PortfolioPosition } from "shared";

export function PositionCard({ position }: { position: PortfolioPosition }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface)] border border-white/5 p-4 flex items-center justify-between">
      <div>
        <div className="text-base font-semibold">{position.asset.symbol}</div>
        <div className="text-xs text-zinc-400 mt-0.5">
          {position.protocolName} · chain {position.chainId}
        </div>
      </div>
      <div className="text-right">
        <div className="text-base font-semibold tabular-nums">
          ${position.balanceUsd.toFixed(2)}
        </div>
        <div className="text-xs text-zinc-500 tabular-nums">
          {position.balanceNative} {position.asset.symbol}
        </div>
      </div>
    </div>
  );
}
