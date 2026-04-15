import { Link, useParams } from "react-router-dom";
import { getRiskTier } from "shared";
import { useVault } from "../hooks/useVault.ts";

const tierColor: Record<string, string> = {
  safe: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  growth: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  bold: "bg-red-500/15 text-red-400 border-red-500/30",
};

const fmtTvl = (usd: string) => {
  const n = Number(usd);
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

export function VaultDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: vault, isLoading, error } = useVault(slug);

  if (isLoading) {
    return <div className="px-6 py-10 max-w-3xl mx-auto text-zinc-400">Loading vault…</div>;
  }
  if (error || !vault) {
    return (
      <div className="px-6 py-10 max-w-3xl mx-auto">
        <div className="text-red-400 mb-4">Vault not found</div>
        <Link to="/discover" className="text-zinc-400 hover:text-white text-sm">
          ← Back to Discover
        </Link>
      </div>
    );
  }

  const tier = getRiskTier(vault);
  const apy = vault.analytics.apy;
  const apy1d = vault.analytics.apy1d ?? 0;
  const apy7d = vault.analytics.apy7d ?? 0;
  const apy30d = vault.analytics.apy30d ?? 0;

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <Link to="/discover" className="text-sm text-zinc-400 hover:text-white inline-block mb-6">
        ← Back
      </Link>

      <header className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider">
            {vault.protocol.name} · {vault.network}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">{vault.name}</h1>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {vault.tags.map((t) => (
              <span
                key={t}
                className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-zinc-400"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border ${tierColor[tier]}`}>{tier}</span>
      </header>

      <section className="rounded-2xl bg-(--color-surface) border border-white/5 p-6 mb-4">
        <div className="text-xs text-zinc-400 uppercase tracking-wider">Current APY</div>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-5xl font-semibold tabular-nums">
            {(apy.total ?? 0).toFixed(2)}%
          </span>
          <span className="text-sm text-zinc-500">p.a.</span>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-6">
          <Stat label="Base" value={`${(apy.base ?? 0).toFixed(2)}%`} />
          <Stat label="Rewards" value={`${(apy.reward ?? 0).toFixed(2)}%`} />
        </div>
      </section>

      <section className="rounded-2xl bg-(--color-surface) border border-white/5 p-6 mb-4">
        <div className="text-xs text-zinc-400 uppercase tracking-wider mb-3">Historical APY</div>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="1d" value={`${apy1d.toFixed(2)}%`} />
          <Stat label="7d" value={`${apy7d.toFixed(2)}%`} />
          <Stat label="30d" value={`${apy30d.toFixed(2)}%`} />
        </div>
      </section>

      <section className="rounded-2xl bg-(--color-surface) border border-white/5 p-6 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="TVL" value={fmtTvl(vault.analytics.tvl.usd)} />
          <Stat label="Chain" value={vault.network} />
          <Stat
            label="Assets"
            value={vault.underlyingTokens.map((t) => t.symbol).join(" / ") || "—"}
          />
          <Stat label="Redeemable" value={vault.isRedeemable ? "Yes" : "No"} />
        </div>
      </section>

      <section className="rounded-2xl bg-(--color-surface) border border-white/5 p-4 mb-8">
        <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Contract</div>
        <div className="font-mono text-xs text-zinc-300 break-all">{vault.address}</div>
      </section>

      <button
        onClick={() => alert("Deposit flow coming next")}
        disabled={!vault.isTransactional}
        className="w-full py-3.5 rounded-xl bg-(--color-brand) font-medium hover:opacity-90 disabled:opacity-40"
      >
        {vault.isTransactional ? "Deposit" : "Not available"}
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-base font-medium tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
