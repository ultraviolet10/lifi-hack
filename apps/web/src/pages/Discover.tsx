import { useState } from "react";
import type { RiskTier } from "shared";
import { useVaults } from "../hooks/useVaults.ts";
import { VaultCard } from "../components/VaultCard.tsx";

const TIERS: (RiskTier | "all")[] = ["all", "safe", "growth", "bold"];

export function Discover() {
  const [tier, setTier] = useState<RiskTier | "all">("all");
  const [sortBy, setSortBy] = useState<"apy" | "tvl">("apy");

  const { data, isLoading, error } = useVaults({
    minApy: 3,
    sortBy,
    riskTier: tier === "all" ? undefined : tier,
  });

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Discover</h1>
        <p className="text-sm text-zinc-400 mt-1">Earn on your crypto. No jargon.</p>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {TIERS.map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className={`px-3 py-1.5 rounded-full text-sm capitalize border ${
              tier === t
                ? "bg-white text-black border-white"
                : "border-white/10 text-zinc-300 hover:border-white/20"
            }`}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "apy" | "tvl")}
            className="bg-[var(--color-surface)] border border-white/10 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="apy">Sort: APY</option>
            <option value="tvl">Sort: TVL</option>
          </select>
        </div>
      </div>

      {isLoading && <div className="text-zinc-400">Loading vaults…</div>}
      {error && <div className="text-red-400">Failed to load vaults</div>}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.data.map((v) => (
            <VaultCard key={v.slug} vault={v} />
          ))}
        </div>
      )}
    </div>
  );
}
