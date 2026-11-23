// 109: one way to name a month and a range of months, for the server's card text and the browser's button label alike.

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/;

/** "2027-05" or "2027-05-01" as "May" (or "May 2027" with the year); null for anything else. */
export function monthName(value: string, withYear = false): string | null {
  const m = value.trim().match(MONTH);
  if (!m) return null;
  const name = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return withYear ? `${name} ${m[1]}` : name;
}

/**
 * A range of months, "Mar–May" within one year and "Mar 2027–Jan 2028" across years, so a range never reads as a shorter
 * one; null when either end isn't a month, or (110) the end comes before the start: that is no range at all.
 */
export function monthRange(from: string, to: string): string | null {
  const ends = [from, to].map((v) => v.trim().match(MONTH));
  if (!ends[0] || !ends[1] || `${ends[1][1]}-${ends[1][2]}` < `${ends[0][1]}-${ends[0][2]}`) return null;
  const years = ends.map((m) => m![1]);
  const withYear = years[0] !== years[1];
  return `${monthName(from, withYear)}–${monthName(to, withYear)}`;
}
