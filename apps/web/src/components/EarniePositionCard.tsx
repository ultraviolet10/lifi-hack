import { useState } from "react";
import type { PortfolioPosition, Vault } from "shared";
import { formatUsd, formatCompactUsd, formatPct } from "../lib/format.ts";
import { mockYieldUsd } from "../lib/mockYield.ts";

type Props = {
  position: PortfolioPosition & { vault: Vault };
};

export function EarniePositionCard({ position }: Props) {
  const [tipOpen, setTipOpen] = useState(false);
  const v = position.vault;
  const yieldUsd = mockYieldUsd(position);
  const tvl = Number(v.analytics.tvl.usd);
  const tags = v.tags.slice(0, 2);

  return (
    <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={v.protocol.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-zinc-100 hover:text-white"
          >
            {v.protocol.name}
            <span className="ml-0.5 text-zinc-500">↗</span>
          </a>
          <span className="ml-2 text-xs text-zinc-500">· {v.network}</span>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400"
            >
              {t}
            </span>
          ))}
          {!v.isRedeemable && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-400">
              Deposit only
            </span>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-2xl font-semibold text-white tabular-nums">
            {formatUsd(position.balanceUsd)}
          </div>
          <div className="mt-0.5 font-mono text-xs text-emerald-400 tabular-nums">
            +{formatUsd(yieldUsd)}{" "}
            <span
              className="text-[10px] uppercase tracking-wide text-zinc-500 underline decoration-dashed underline-offset-2"
              title="Estimated — not yet wired to live data"
            >
              est.
            </span>
          </div>
        </div>

        <div className="relative text-right">
          <button
            type="button"
            onMouseEnter={() => setTipOpen(true)}
            onMouseLeave={() => setTipOpen(false)}
            onClick={() => setTipOpen((o) => !o)}
            onBlur={() => setTipOpen(false)}
            className="inline-flex items-center gap-1 font-mono text-xl font-semibold text-emerald-300 tabular-nums focus:outline-none"
          >
            {formatPct(v.analytics.apy.total)}
            <span className="text-xs text-zinc-500">ⓘ</span>
          </button>
          <div className="text-[11px] text-zinc-500">APY</div>
          {tipOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-white/10 bg-zinc-950/95 p-3 text-left shadow-xl backdrop-blur">
              <div className="mb-2 flex justify-between text-xs">
                <span className="text-zinc-400">Base</span>
                <span className="font-mono text-zinc-200">{formatPct(v.analytics.apy.base)}</span>
              </div>
              <div className="mb-3 flex justify-between text-xs">
                <span className="text-zinc-400">Reward</span>
                <span className="font-mono text-emerald-300">
                  {formatPct(v.analytics.apy.reward)}
                </span>
              </div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Trend</div>
              <div className="flex gap-1">
                {[
                  { label: "1d", v: v.analytics.apy1d },
                  { label: "7d", v: v.analytics.apy7d },
                  { label: "30d", v: v.analytics.apy30d },
                ].map((p) => (
                  <span
                    key={p.label}
                    className="flex-1 rounded-md bg-zinc-800/70 px-2 py-1 text-center text-[11px]"
                  >
                    <span className="text-zinc-500">{p.label}</span>{" "}
                    <span className="font-mono text-zinc-200">{formatPct(p.v, 1)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 text-xs text-zinc-500">TVL {formatCompactUsd(tvl)}</div>
    </div>
  );
}
