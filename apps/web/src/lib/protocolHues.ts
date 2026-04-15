const KNOWN: Record<string, number> = {
  "yo-protocol": 145,
  aave: 270,
  morpho: 330,
  compound: 160,
  euler: 200,
  spark: 30,
  pendle: 320,
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function protocolHue(name: string): number {
  const key = name.toLowerCase();
  if (key in KNOWN) return KNOWN[key];
  return hash(key) % 360;
}
