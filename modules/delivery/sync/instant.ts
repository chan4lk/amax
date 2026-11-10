/**
 * 096 review round 2: the one rule for a time the repo gives (state.json's phase times, a release's archive time), run
 * by the reader (the plugin, CI, the self-sync) and by the server where a write is built, so the same value is the same
 * instant on every host. Only ISO 8601: a date (midnight UTC), or a date and time, with or without an offset; one with
 * no offset is read as UTC, never in the host's time zone. Anything else (V8's legacy formats included, or a date that
 * doesn't exist, like 2026-02-30) is unknown: null.
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/i;

export function instant(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = ISO.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", frac = "", zone] = m;
  // The calendar date must exist as written (Date.parse would roll 2026-02-30 over to March).
  const day = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (day.getUTCFullYear() !== Number(y) || day.getUTCMonth() !== Number(mo) - 1 || day.getUTCDate() !== Number(d)) return null;
  const offset = !zone || zone.toUpperCase() === "Z" ? "Z" : zone.includes(":") ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${frac.slice(0, 4)}${offset}`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
