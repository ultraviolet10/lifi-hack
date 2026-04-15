export function formatUsd(n: number, fractionDigits = 2): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

export function formatCompactUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatPct(n: number | null | undefined, digits = 2): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}

export interface MoneyParts {
  text: string;
  whole: string;
  dec: string;
  tiny: boolean;
}

export function formatMoney(
  n: number,
  opts: { symbol?: string; prefix?: string } = {},
): MoneyParts {
  const { symbol, prefix = "" } = opts;
  const safe = Number.isFinite(n) ? n : 0;
  const tiny = safe > 0 && safe < 0.005;
  const value = tiny ? 0 : safe;
  const [w, d] = value.toFixed(2).split(".");
  const whole = `${tiny ? "<" : ""}${prefix}${w}`;
  const dec = d;
  const text = symbol ? `${whole}.${dec} ${symbol}` : `${whole}.${dec}`;
  return { text, whole, dec, tiny };
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
