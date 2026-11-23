import type { EmploymentPeriod } from "@amax/hr/contracts";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** `n` months starting with the month of `today`, as first-of-month dates. */
export const windowMonths = (today: Date, n: number) => Array.from({ length: n }, (_, i) => iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1))));

/** Months after the current quarter are a forecast (the mock's "Jan, forecast"). */
export const isForecast = (month: string, today: Date) => {
  const end = new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3 + 3, 1));
  return month >= iso(end);
};

const FORMAT = { short: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }), long: new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }) };
const named = new Map<string, string>();
export const monthLabel = (month: string, style: "short" | "long" = "short") => {
  const key = `${style}${month}`;
  let name = named.get(key);
  if (name === undefined) named.set(key, (name = FORMAT[style].format(new Date(`${month}T00:00:00Z`))));
  return name;
};

/** FTE on the 15th of the month: a joiner on Nov 2 counts for November, a leaver on Nov 10 doesn't. */
export function fteIn(periods: EmploymentPeriod[], month: string) {
  const mid = `${month.slice(0, 8)}15`;
  return periods.find((p) => p.startsOn <= mid && (p.endsOn === null || p.endsOn >= mid))?.fte ?? 0;
}

export function inWindow(month: string, window: string[]) {
  const first = window[0]?.slice(0, 7);
  if (!first) return month;
  let [y, n] = month.split("-").map(Number);
  for (let i = 0; i < 3 && `${y}-${String(n).padStart(2, "0")}` < first; i++) y++;
  return `${y}-${String(n).padStart(2, "0")}`;
}
