import type { YoYieldPoint } from "./api.ts";

function seededRand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockYieldTimeseries(seed: string, points = 60, baseApy = 4.5): YoYieldPoint[] {
  const rand = seededRand(seed);
  const now = Date.now();
  const stepMs = 60 * 60 * 1000; // 1h
  const result: YoYieldPoint[] = [];
  let value = baseApy;
  for (let i = points - 1; i >= 0; i--) {
    const drift = (rand() - 0.5) * 0.6;
    value = Math.max(baseApy - 2, Math.min(baseApy + 2, value + drift));
    const occasionalSpike = rand() > 0.92 ? (rand() - 0.5) * 2 : 0;
    result.push({
      timestamp: now - i * stepMs,
      yield: (value + occasionalSpike).toFixed(4),
    });
  }
  return result;
}
