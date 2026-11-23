import { bandOfPct } from "./look";
import type { PersonUtilisation } from "../contracts";
import type { Report } from "../server/view";

export const BANDS = ["under", "on", "over", "none"] as const;
export type BandKey = (typeof BANDS)[number];
export type Filter = { band?: BandKey; find?: string };

const BAND_WORDS: Record<BandKey, string> = { under: "under target", on: "on target", over: "over 100%", none: "with no submitted time yet" };

export const bandOf = bandOfPct;

export const filterOf = (raw: { band?: string; find?: string }): Filter => ({
  band: BANDS.find((b) => b === raw.band),
  find: raw.find?.trim().slice(0, 60) || undefined,
});

const keeps = (f: Filter, target: number) => (p: Pick<PersonUtilisation, "name" | "utilisation">) =>
  (!f.band || bandOf(p.utilisation, target) === f.band) && (!f.find || p.name.toLowerCase().includes(f.find.toLowerCase()));

export function filtered(r: Report, f: Filter): Report {
  if (!f.band && !f.find) return r;
  const rows = r.rows.filter(keeps(f, r.target));
  const ids = new Set(rows.map((x) => x.userId));
  return { ...r, rows, availability: { ...r.availability, rows: r.availability.rows.filter((x) => ids.has(x.userId)) } };
}

export const describe = (f: Filter) => [f.band ? `people ${BAND_WORDS[f.band]}` : null, f.find ? `names with "${f.find}"` : null].filter(Boolean).join(", ");
