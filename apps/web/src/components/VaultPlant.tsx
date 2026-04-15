import { useEffect, useMemo, useState } from "react";
import { Liveline } from "liveline";
import type { MatchedPosition } from "../hooks/useYieldPositions.ts";
import { usdcPositionUsd } from "../hooks/useYieldPositions.ts";
import { mockYieldUsd } from "../lib/mockYield.ts";
import { protocolHue } from "../lib/protocolHues.ts";
import { getYoVaultYieldTimeseries, type YoYieldPoint } from "../lib/api.ts";
import { mockYieldTimeseries } from "../lib/mockTimeseries.ts";
import { Flower } from "./Flower.tsx";

interface Accent {
  line: string;
  petal: string;
  shade: string;
  core: string;
}

const ACCENTS: Record<string, Accent> = {
  "yo-protocol": {
    line: "#CCFF00",
    petal: "#CCFF00",
    shade: "#7A9900",
    core: "#F4FFB0",
  },
  morpho: {
    line: "#FF5FA8",
    petal: "#FF5FA8",
    shade: "#A8336C",
    core: "#FFD1E6",
  },
};

interface VaultPlantProps {
  position: MatchedPosition;
  delayMs?: number;
}

type Phase = "seed" | "sprout" | "bloom";

export function VaultPlant({ position, delayMs = 0 }: VaultPlantProps) {
  const protocol = position.vault.protocol.name;
  const hue = protocolHue(protocol);
  const principal = Number(usdcPositionUsd(position)) || 0;
  const yieldUsd = Number(mockYieldUsd(position)) || 0;
  const protocolKey = protocol.toLowerCase();
  const isYo = protocolKey === "yo-protocol";
  const isMorpho = protocolKey === "morpho";
  const hasChart = isYo || isMorpho;
  const accent = ACCENTS[protocolKey];

  const [phase, setPhase] = useState<Phase>("seed");
  const [points, setPoints] = useState<YoYieldPoint[]>([]);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("sprout"), delayMs + 300);
    const t2 = setTimeout(() => setPhase("bloom"), delayMs + 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [delayMs]);

  useEffect(() => {
    if (isMorpho) {
      setPoints(mockYieldTimeseries(position.vault.address, 60, 4.5));
      return;
    }
    if (!isYo) return;
    let cancelled = false;
    void getYoVaultYieldTimeseries(position.vault.network, position.vault.address)
      .then((data) => {
        if (!cancelled) setPoints(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isYo, isMorpho, position.vault.network, position.vault.address]);

  const chartData = useMemo(
    () =>
      points
        .map((p) => ({ time: Math.floor(p.timestamp / 1000), value: Number(p.yield) }))
        .filter((p) => Number.isFinite(p.value)),
    [points],
  );

  const latest = chartData.at(-1);
  const earliest = chartData.at(0);
  const windowSecs = latest && earliest ? Math.max(60, latest.time - earliest.time) : 30;

  const flowerY = useMemo(() => {
    if (!latest || chartData.length < 2) return 50;
    const values = chartData.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (max === min) return 50;
    return ((max - latest.value) / (max - min)) * 100;
  }, [chartData, latest]);

  const flowerSize = hasChart ? 92 : Math.round(72 + Math.sqrt(principal) * 4);
  const half = flowerSize / 2;

  const vaultName = isYo
    ? `yo${position.asset.symbol.replace(/USDC$/i, "USD")}`
    : position.vault.name;
  const subtitle = isYo
    ? "Yo Protocol"
    : position.vault.protocol.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const lineColor = accent?.line ?? `hsl(${hue} 70% 55%)`;

  return (
    <div
      className="plant-rise-anim relative"
      style={{
        width: 300,
        animation: "plant-rise 500ms cubic-bezier(0.22,1,0.36,1) both",
        animationDelay: `${delayMs}ms`,
      }}
    >
      <div className="rounded-xl bg-zinc-900/90 px-4 pb-4 pt-3 ring-1 ring-white/10 shadow-2xl backdrop-blur-md">
        <div className="flex items-baseline justify-between gap-2 pb-3">
          <div className="flex flex-col">
            <span className="font-display truncate text-base text-white">{vaultName}</span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">{subtitle}</span>
          </div>
          <span className="font-mono text-sm text-zinc-300">
            ${principal < 1 ? principal.toFixed(3) : principal.toFixed(2)}
          </span>
        </div>
        {hasChart ? (
          <div className="relative h-28 overflow-visible">
            {chartData.length > 0 && (
              <Liveline
                data={chartData}
                value={latest?.value ?? 0}
                window={windowSecs}
                color={lineColor}
                paused
                badge={false}
                grid={false}
                fill={false}
                momentum={false}
                pulse={false}
                padding={{ top: 6, right: 6, bottom: 6, left: 6 }}
              />
            )}
            <div
              className="pointer-events-none absolute"
              style={{
                right: -half + 8,
                top: `calc(${flowerY}% - ${half}px)`,
              }}
            >
              <Flower
                hue={hue}
                yieldUsd={yieldUsd}
                principalUsd={principal}
                phase={phase}
                size={flowerSize}
                petalColor={accent?.petal}
                petalShade={accent?.shade}
                coreColor={accent?.core}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-28 items-center justify-center">
            <Flower
              hue={hue}
              yieldUsd={yieldUsd}
              principalUsd={principal}
              phase={phase}
              size={flowerSize}
            />
          </div>
        )}
      </div>
    </div>
  );
}
