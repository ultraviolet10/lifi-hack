const ICONS: Record<string, string> = {
  aave: "🅰",
  morpho: "⧗",
  yearn: "🟦",
  beefy: "🐂",
  compound: "🪙",
  pendle: "⟁",
  convex: "❄",
  curve: "∫",
  balancer: "⚖",
  uniswap: "🦄",
  lido: "🟠",
  "rocket-pool": "🚀",
  gearbox: "⚙",
  eigenlayer: "◈",
  ethena: "Ǝ",
  sky: "☁",
  spark: "✦",
  fluid: "💧",
  silo: "◱",
  euler: "ε",
  notional: "◐",
  origin: "◉",
  frax: "❖",
  stargate: "✺",
  sushi: "🍣",
  velodrome: "🏁",
  aerodrome: "✈",
  pancake: "🥞",
  kamino: "◆",
  exactly: "=",
  term: "§",
  spectra: "◊",
  moonwell: "🌙",
  maker: "Ⓜ",
  dai: "◈",
  gmx: "⚡",
  jones: "◎",
  radiant: "☀",
  benqi: "❂",
};

export function protocolIcon(
  slug: string,
  protocolName: string,
): { glyph: string; isMono: boolean } {
  const full = slug.toLowerCase();
  const key = full.split("-")[0];
  if (ICONS[key]) return { glyph: ICONS[key], isMono: false };
  for (const k of Object.keys(ICONS)) {
    if (full.includes(k)) return { glyph: ICONS[k], isMono: false };
  }
  const nameLower = protocolName.toLowerCase();
  for (const k of Object.keys(ICONS)) {
    if (nameLower.includes(k)) return { glyph: ICONS[k], isMono: false };
  }
  return { glyph: monogram(protocolName), isMono: true };
}

function monogram(name: string): string {
  const parts = name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
