import type { CompassDirection } from "shared";
import { protocolIcon } from "../lib/protocolIcons.ts";
import { formatPct } from "../lib/format.ts";

export const directionTint: Record<CompassDirection, string> = {
  safe: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/40",
  growth: "bg-amber-500/15 text-amber-200 ring-amber-400/40",
  bold: "bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40",
  wild: "bg-rose-500/15 text-rose-200 ring-rose-400/40",
};

type Props = {
  slug: string;
  protocolName: string;
  direction: CompassDirection;
  apy: number | null;
  rationale: string;
  selected: boolean;
  tooltipPlacement: "top" | "bottom";
  onClick: () => void;
};

export function VaultCompassTile({
  slug,
  protocolName,
  direction,
  apy,
  rationale,
  selected,
  tooltipPlacement,
  onClick,
}: Props) {
  const { glyph, isMono } = protocolIcon(slug, protocolName);
  const tooltipPos = tooltipPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2";
  const arrowPos =
    tooltipPlacement === "top"
      ? "-bottom-1 left-1/2 -translate-x-1/2 rotate-45 border-b border-r"
      : "-top-1 left-1/2 -translate-x-1/2 rotate-45 border-t border-l";

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={`${protocolName} — ${direction} · APY ${formatPct(apy)}`}
        className={`flex aspect-square w-full flex-col justify-between rounded-xl p-1.5 text-left ring-1 transition duration-200 ${directionTint[direction]} ${selected ? "scale-110 ring-2" : "group-hover:scale-105"} motion-reduce:transition-none motion-reduce:group-hover:scale-100`}
      >
        <div className="flex items-start justify-between gap-1">
          <span className={isMono ? "font-display text-[11px]" : "text-sm leading-none"}>
            {glyph}
          </span>
          <span className="font-display rounded-full bg-black/40 px-1.5 text-[10px] leading-tight text-white/95">
            {formatPct(apy)}
          </span>
        </div>
        <span className="font-display truncate text-[10px] text-white/80">{protocolName}</span>
      </button>

      <div
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-20 w-56 -translate-x-1/2 rounded-xl bg-zinc-900 p-3 opacity-0 ring-1 ring-white/10 shadow-xl transition-opacity duration-150 delay-100 group-hover:opacity-100 motion-reduce:transition-none ${tooltipPos}`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display truncate text-base text-white">{protocolName}</span>
          <span className="font-display text-sm text-emerald-300">{formatPct(apy)}</span>
        </div>
        <p className="mt-1 text-xs leading-snug text-zinc-300">{rationale}</p>
        <span
          className={`absolute size-2 bg-zinc-900 ring-white/10 ${arrowPos}`}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
