import type { Forecast } from "../server/forecast";

export const LEFT = 60;
export const RIGHT = 810;
export const TOP = 68;
export const BOTTOM = 260;

export type Scale = { x: (i: number) => number; y: (v: number) => number; ticks: number[] };

export function scaleOf(f: Forecast): Scale {
  const values = f.months.flatMap((m) => [m.capacity, m.demand]).filter((v) => v > 0);
  const low = Math.floor((Math.min(...values) - 2) / 4) * 4;
  const high = Math.ceil((Math.max(...values) + 1) / 4) * 4;
  return {
    x: (i) => LEFT + (i * (RIGHT - LEFT)) / Math.max(1, f.months.length - 1),
    y: (v) => TOP + ((high - Math.min(high, Math.max(low, v))) * (BOTTOM - TOP)) / (high - low),
    ticks: Array.from({ length: (high - low) / 4 + 1 }, (_, k) => low + k * 4),
  };
}

export const points = (f: Forecast, s: Scale, key: "capacity" | "demand") => f.months.map((m, i) => `${s.x(i)},${s.y(m[key]).toFixed(1)}`).join(" ");
