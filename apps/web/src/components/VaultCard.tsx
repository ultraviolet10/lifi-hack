import { Link } from "react-router-dom";
import type { Vault } from "shared";
import { getRiskTier } from "shared";

const tierColor: Record<string, string> = {
  safe: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  growth: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  bold: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function VaultCard({ vault }: { vault: Vault }) {
  const tier = getRiskTier(vault);
  const apy = vault.analytics.apy.total ?? 0;
  const tvl = Number(vault.analytics.tvl.usd);

  return (
    <div className="rounded-2xl bg-[var(--color-surface)] border border-white/5 p-5 flex flex-col gap-3 hover:border-white/10 transition">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold leading-tight">{vault.name}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{vault.protocol?.name ?? "—"}</div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${tierColor[tier]}`}>{tier}</span>
      </div>

      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-3xl font-semibold tabular-nums">{apy.toFixed(2)}%</span>
        <span className="text-xs text-zinc-500">p.a.</span>
      </div>

      <div className="text-xs text-zinc-500">
        TVL $
        {tvl >= 1_000_000 ? `${(tvl / 1_000_000).toFixed(1)}M` : `${(tvl / 1_000).toFixed(0)}K`}
      </div>

      <div className="flex gap-2 mt-2">
        <Link
          to={`/vault/${vault.slug}`}
          className="flex-1 text-sm py-2 rounded-lg bg-white/5 hover:bg-white/10 text-center"
        >
          View
        </Link>
        <button
          className="flex-1 text-sm py-2 rounded-lg bg-[var(--color-brand)] hover:opacity-90 font-medium"
          onClick={() => alert("Deposit flow coming next")}
        >
          Deposit
        </button>
      </div>
    </div>
  );
}
