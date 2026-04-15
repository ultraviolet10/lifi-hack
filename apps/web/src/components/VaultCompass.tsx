import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { CompassDirection, CompassPick, Vault } from "shared";
import { useCompass } from "../hooks/useCompass.ts";
import { useVaults } from "../hooks/useVaults.ts";
import { VaultCompassTile, directionTint } from "./VaultCompassTile.tsx";
import { formatCompactUsd, formatPct } from "../lib/format.ts";

type Props = { open: boolean; asset?: string };

const QUADRANT: Record<CompassDirection, { rows: [number, number]; cols: [number, number] }> = {
  safe: { rows: [0, 1], cols: [0, 1] },
  growth: { rows: [0, 1], cols: [2, 3] },
  wild: { rows: [2, 3], cols: [0, 1] },
  bold: { rows: [2, 3], cols: [2, 3] },
};

const DIR_LABEL: Record<CompassDirection, string> = {
  safe: "SAFE",
  growth: "GROWTH",
  bold: "BOLD",
  wild: "WILD",
};

const DIR_CHIP_POS: Record<CompassDirection, string> = {
  safe: "-top-8 left-0",
  growth: "-top-8 right-0",
  wild: "-bottom-8 left-0",
  bold: "-bottom-8 right-0",
};

const DIR_CHIP_TINT: Record<CompassDirection, string> = {
  safe: "text-emerald-300/80",
  growth: "text-amber-300/80",
  bold: "text-fuchsia-300/80",
  wild: "text-rose-300/80",
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function placePicks(picks: CompassPick[]): Map<string, { r: number; c: number }> {
  const positions = new Map<string, { r: number; c: number }>();
  const byDir = new Map<CompassDirection, CompassPick[]>();
  for (const p of picks) {
    const arr = byDir.get(p.direction) ?? [];
    arr.push(p);
    byDir.set(p.direction, arr);
  }
  for (const [dir, items] of byDir) {
    const q = QUADRANT[dir];
    const cells: Array<{ r: number; c: number }> = [];
    for (const r of q.rows) for (const c of q.cols) cells.push({ r, c });
    const sorted = [...items].sort((a, b) => a.vaultSlug.localeCompare(b.vaultSlug));
    for (let i = 0; i < sorted.length; i++) {
      const seed = hash(sorted[i].vaultSlug) + i * 7919;
      const idx = (seed + i) % cells.length;
      const [picked] = cells.splice(idx, 1);
      positions.set(sorted[i].vaultSlug, picked);
    }
  }
  return positions;
}

function trendColor(curr: number | null, prev: number | null): string {
  if (curr == null || prev == null) return "text-zinc-400";
  if (curr > prev) return "text-emerald-300";
  if (curr < prev) return "text-rose-300";
  return "text-zinc-300";
}

export function VaultCompass({ open, asset }: Props) {
  const { address } = useAccount();
  const compass = useCompass(address, asset, open);
  const vaultsQ = useVaults({ asset });
  const [selected, setSelected] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selected) return;
    const id = requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => cancelAnimationFrame(id);
  }, [selected]);

  const vaultBySlug = useMemo(() => {
    const m = new Map<string, Vault>();
    for (const v of vaultsQ.data?.data ?? []) m.set(v.slug, v);
    return m;
  }, [vaultsQ.data]);

  const positions = useMemo(
    () => (compass.data ? placePicks(compass.data.picks) : new Map()),
    [compass.data],
  );

  if (compass.isLoading || vaultsQ.isLoading) return <CompassSkeleton />;
  if (compass.isError || !compass.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-zinc-400">Couldn't map the yield landscape.</p>
        <button
          onClick={() => compass.refetch()}
          className="rounded-full bg-white px-4 py-2 text-sm text-black"
        >
          Retry
        </button>
      </div>
    );
  }

  const picks = compass.data.picks;
  const selectedPick = picks.find((p) => p.vaultSlug === selected);
  const selectedVault = selectedPick ? vaultBySlug.get(selectedPick.vaultSlug) : undefined;
  const placedQuadrants = new Set(picks.map((p) => p.direction));

  return (
    <div>
      {/* OUTER — axis (risk / strategy) labels */}
      <div className="relative mx-auto w-full max-w-136 px-10 py-10">
        <span className="font-display absolute left-0 right-0 top-1 text-center text-sm tracking-[0.25em] text-zinc-200">
          ← LOWER RISK
        </span>
        <span className="font-display absolute bottom-1 left-0 right-0 text-center text-sm tracking-[0.25em] text-zinc-200">
          HIGHER RISK →
        </span>
        <span className="font-display absolute left-1 top-1/2 origin-center -translate-y-1/2 -rotate-90 whitespace-nowrap text-sm tracking-[0.25em] text-zinc-200">
          PASSIVE ←
        </span>
        <span className="font-display absolute right-1 top-1/2 origin-center -translate-y-1/2 rotate-90 whitespace-nowrap text-sm tracking-[0.25em] text-zinc-200">
          → ACTIVE
        </span>

        {/* MIDDLE — quadrant corner labels (safe / growth / wild / bold) */}
        <div className="relative mx-auto aspect-square w-full max-w-sm">
          {(["safe", "growth", "bold", "wild"] as CompassDirection[]).map((dir) =>
            placedQuadrants.has(dir) ? (
              <span
                key={dir}
                className={`font-display pointer-events-none absolute z-10 text-[11px] tracking-[0.2em] ${DIR_CHIP_POS[dir]} ${DIR_CHIP_TINT[dir]}`}
              >
                {DIR_LABEL[dir]}
              </span>
            ) : null,
          )}

          {/* INNER — 4x4 grid itself, full size of middle */}
          <div className="absolute inset-0">
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-white/10" />
              <div className="absolute bottom-0 top-0 left-1/2 border-l border-dashed border-white/10" />
            </div>
            <div className="grid h-full w-full grid-cols-4 grid-rows-4 gap-2">
              {Array.from({ length: 16 }).map((_, i) => {
                const r = Math.floor(i / 4);
                const c = i % 4;
                const pick = picks.find((p) => {
                  const pos = positions.get(p.vaultSlug);
                  return pos?.r === r && pos?.c === c;
                });
                if (!pick) return <div key={i} className="rounded-xl bg-zinc-900/30" />;
                const vault = vaultBySlug.get(pick.vaultSlug);
                return (
                  <VaultCompassTile
                    key={pick.vaultSlug}
                    slug={pick.vaultSlug}
                    protocolName={vault?.protocol.name ?? pick.vaultSlug}
                    direction={pick.direction}
                    apy={vault?.analytics.apy.total ?? null}
                    rationale={pick.rationale}
                    selected={selected === pick.vaultSlug}
                    tooltipPlacement={r === 0 ? "bottom" : "top"}
                    onClick={() => setSelected(selected === pick.vaultSlug ? null : pick.vaultSlug)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedPick && selectedVault && (
        <div
          ref={cardRef}
          className={`mt-6 overflow-hidden rounded-2xl border border-white/5 p-4 animate-[fade-in_180ms_ease-out] ${directionTint[selectedPick.direction]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-xs tracking-[0.2em] opacity-70">
                {DIR_LABEL[selectedPick.direction]}
              </div>
              <div className="font-display mt-0.5 text-xl text-white">
                {selectedVault.protocol.name}
                <span className="ml-2 text-xs text-zinc-400">· {selectedVault.network}</span>
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="rounded-full px-2 text-sm text-white/60 hover:text-white"
            >
              ×
            </button>
          </div>
          <p className="mt-2 text-sm text-white/90">{selectedPick.rationale}</p>

          {/* APY trend */}
          <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-black/20 p-3">
            <TrendCell label="APY" value={selectedVault.analytics.apy.total} tone="text-white" />
            <TrendCell
              label="1d"
              value={selectedVault.analytics.apy1d}
              tone={trendColor(selectedVault.analytics.apy1d, selectedVault.analytics.apy.total)}
            />
            <TrendCell
              label="7d"
              value={selectedVault.analytics.apy7d}
              tone={trendColor(selectedVault.analytics.apy7d, selectedVault.analytics.apy1d)}
            />
            <TrendCell
              label="30d"
              value={selectedVault.analytics.apy30d}
              tone={trendColor(selectedVault.analytics.apy30d, selectedVault.analytics.apy7d)}
            />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-300">
              <span>
                TVL{" "}
                <span className="text-white">
                  {formatCompactUsd(Number(selectedVault.analytics.tvl.usd))}
                </span>
              </span>
              <span className="text-zinc-500">·</span>
              <span className="truncate text-zinc-400">{tokenList(selectedVault)}</span>
            </div>
            <a
              href={selectedVault.protocol.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black"
            >
              Deposit
            </a>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function TrendCell({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  return (
    <div className="flex flex-col items-start">
      <span className="font-display text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </span>
      <span className={`font-display text-base ${tone}`}>{formatPct(value)}</span>
    </div>
  );
}

function tokenList(v: Vault): string {
  const syms = v.underlyingTokens.map((t) => t.symbol);
  if (syms.length <= 3) return syms.join(" · ");
  return `${syms.slice(0, 3).join(" · ")} +${syms.length - 3}`;
}

function CompassSkeleton() {
  return (
    <div className="mx-auto grid aspect-square max-w-sm grid-cols-4 grid-rows-4 gap-2 p-1">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl bg-zinc-900" />
      ))}
    </div>
  );
}
