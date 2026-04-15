import { useEffect, useMemo, useState } from "react";
import { Liveline, type HoverPoint } from "liveline";
import { getYoVaultYieldTimeseries, type YoYieldPoint } from "../lib/api";

type VaultYieldCardProps = {
  network: string;
  vaultAddress: string;
  protocolName: string;
  className?: string;
};

function formatPct(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatUpdated(timestampMs: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestampMs);
}

export function VaultYieldCard({
  network,
  vaultAddress,
  protocolName,
  className = "",
}: VaultYieldCardProps) {
  const [points, setPoints] = useState<YoYieldPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverPoint | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const data = await getYoVaultYieldTimeseries(network, vaultAddress);

        if (!cancelled) {
          setPoints(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load yield data");
          setPoints([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [network, vaultAddress]);

  const chartData = useMemo(() => {
    return points
      .map((p) => ({
        time: Math.floor(p.timestamp / 1000),
        value: Number(p.yield),
      }))
      .filter((p) => Number.isFinite(p.value));
  }, [points]);

  const latestPoint = chartData.at(-1);
  const earliestPoint = chartData.at(0);
  const latestValue = latestPoint?.value ?? 0;
  const latestTimestamp = latestPoint ? latestPoint.time * 1000 : undefined;
  const windowSecs =
    latestPoint && earliestPoint ? Math.max(60, latestPoint.time - earliestPoint.time) : 30;

  return (
    <div
      className={["rounded-xl bg-zinc-900 p-3 ring-1 ring-white/10 shadow-xl", className].join(" ")}
    >
      <div
        className={["transition-opacity duration-150", hover ? "opacity-100" : "opacity-0"].join(
          " ",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display truncate text-base text-white">{protocolName}</span>
          <span className="font-display text-sm text-emerald-300">
            {formatPct(hover?.value ?? latestValue)}
          </span>
        </div>
        <p className="mt-1 text-xs leading-snug text-zinc-300">
          {hover
            ? formatUpdated(hover.time * 1000)
            : latestTimestamp
              ? `Updated ${formatUpdated(latestTimestamp)}`
              : "Daily historical yield from YO."}
        </p>
      </div>

      <div className="mt-3 h-24 overflow-hidden rounded-lg bg-white/[0.03] px-2 py-2">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-zinc-400">Loading chart…</span>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-center">
            <span className="text-xs leading-snug text-rose-300">{error}</span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-zinc-400">No yield data available</span>
          </div>
        ) : (
          <Liveline
            data={chartData}
            value={latestValue}
            window={windowSecs}
            color="#22c55e"
            paused
            badge={false}
            grid={false}
            scrub
            fill={false}
            momentum={false}
            pulse={false}
            padding={{ top: 4, right: 4, bottom: 4, left: 4 }}
            onHover={setHover}
          />
        )}
      </div>
    </div>
  );
}
