import type { Forecast } from "../server/forecast";

export const LEFT = 60;
export const RIGHT = 810;
export const TOP = 68;
export const BOTTOM = 260;

export type Scale = { x: (i: number) => number; y: (v: number) => number; ticks: number[] };

export function scaleOf(f: Forecast): Scale {
  const all = f.months.flatMap((m) => [m.capacity, m.demand]).filter((v) => v > 0);
  const values = all.filter((v) => v >= Math.max(...all) / 2);
  const low = Math.floor((Math.min(...values) - 2) / 4) * 4;
  const high = Math.ceil((Math.max(...values) + 1) / 4) * 4;
  const step = 4 * Math.max(1, Math.ceil((high - low) / 4 / 6));
  return {
    x: (i) => LEFT + (i * (RIGHT - LEFT)) / Math.max(1, f.months.length - 1),
    y: (v) => TOP + ((high - Math.min(high, Math.max(low, v))) * (BOTTOM - TOP)) / (high - low),
    ticks: Array.from({ length: Math.floor((high - low) / step) + 1 }, (_, k) => low + k * step),
  };
}

export const points = (f: Forecast, s: Scale, key: "capacity" | "demand") => f.months.map((m, i) => `${s.x(i)},${s.y(m[key]).toFixed(1)}`).join(" ");
