import { useLayoutEffect, useRef, useState } from "react";

type YieldBalanceProps = {
  principal: number;
  yieldAmount: number;
  currency?: string;
  onClick?: () => void;
};

function formatParts(n: number, currency: string) {
  const [whole, dec] = n.toFixed(2).split(".");
  return { whole: `${currency}${whole}`, dec };
}

const PAD_X = 24;
const PAD_Y = 10;

export function YieldBalance({
  principal,
  yieldAmount,
  currency = "$",
  onClick,
}: YieldBalanceProps) {
  const total = principal + yieldAmount;
  const totalParts = formatParts(total, currency);
  const principalParts = formatParts(principal, currency);
  const yieldParts = formatParts(yieldAmount, currency);

  const combinedRef = useRef<HTMLSpanElement>(null);
  const splitRef = useRef<HTMLSpanElement>(null);
  const [dims, setDims] = useState<{ cw: number; sw: number; h: number } | null>(null);
  const [active, setActive] = useState(false);

  useLayoutEffect(() => {
    const c = combinedRef.current;
    const s = splitRef.current;
    if (!c || !s) return;
    setDims({
      cw: c.offsetWidth,
      sw: s.offsetWidth,
      h: Math.max(c.offsetHeight, s.offsetHeight),
    });
  }, [total, principal, yieldAmount]);

  const width = dims ? (active ? dims.sw : dims.cw) + PAD_X : undefined;
  const height = dims ? dims.h + PAD_Y : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{ width, height }}
      className="relative inline-block rounded-2xl border-2 border-dotted border-earnie-pink align-middle transition-[width,height] duration-[220ms] ease-[cubic-bezier(0.645,0.045,0.355,1)] active:scale-[0.98] focus:outline-none motion-reduce:transition-none motion-reduce:active:scale-100"
    >
      {/* Combined */}
      <span
        ref={combinedRef}
        className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 whitespace-nowrap transition-opacity duration-150 ease-[cubic-bezier(0.215,0.61,0.355,1)] motion-reduce:transition-none ${active ? "opacity-0" : "opacity-100"}`}
      >
        <span className="bg-linear-to-r from-white to-earnie-pink bg-clip-text font-mono text-3xl font-semibold leading-none text-transparent">
          {totalParts.whole}
        </span>
        <span className="bg-linear-to-r from-white to-earnie-pink bg-clip-text font-mono text-sm font-medium leading-none text-transparent">
          .{totalParts.dec}
        </span>
      </span>

      {/* Split */}
      <span
        ref={splitRef}
        className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 whitespace-nowrap transition-opacity duration-200 ease-[cubic-bezier(0.215,0.61,0.355,1)] motion-reduce:transition-none ${active ? "opacity-100" : "opacity-0"}`}
      >
        <span className="flex items-baseline gap-0.5">
          <span className="font-mono text-3xl font-semibold leading-none text-white">
            {principalParts.whole}
          </span>
          <span className="font-mono text-sm text-zinc-400">.{principalParts.dec}</span>
        </span>
        <span className="flex items-baseline gap-0.5 text-emerald-400">
          <span className="font-mono text-3xl font-semibold leading-none">+{yieldParts.whole}</span>
          <span className="font-mono text-sm">.{yieldParts.dec}</span>
        </span>
      </span>
    </button>
  );
}
