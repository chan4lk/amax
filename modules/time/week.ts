export type IsoWeek = { year: number; week: number };

const DAY = 86_400_000;
const utc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function isoWeekOf(date: Date): IsoWeek {
  const t = new Date(utc(date));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const year = t.getUTCFullYear();
  return { year, week: Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7) };
}

export function weekStart({ year, week }: IsoWeek): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  return new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY + (week - 1) * 7 * DAY);
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
/** "2026-10-14" → "Wed Oct 14", as confirm cards and the bell name a day (070 amendment 2). */
export const dayLabel = (day: string) => DAY_LABEL.format(new Date(`${day}T00:00:00Z`)).replace(",", "");

export const workDays = (w: IsoWeek) => [0, 1, 2, 3, 4].map((i) => isoDate(new Date(weekStart(w).getTime() + i * DAY)));
const allDays = (w: IsoWeek) => [0, 1, 2, 3, 4, 5, 6].map((i) => isoDate(new Date(weekStart(w).getTime() + i * DAY)));
export const isWeekend = (day: string) => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
/** 073 AC-1: the days a week shows: Monday to Friday, plus Saturday and Sunday when it has weekend hours. */
export const shownDays = (w: IsoWeek, logged: string[]) => (logged.some(isWeekend) ? allDays(w) : workDays(w));

export const shiftWeek = (w: IsoWeek, by: number) => isoWeekOf(new Date(weekStart(w).getTime() + by * 7 * DAY));

export const weekKey = ({ year, week }: IsoWeek) => `${year}-W${String(week).padStart(2, "0")}`;

export function parseWeekKey(key: string | undefined): IsoWeek | null {
  const m = key?.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const w = { year: Number(m[1]), week: Number(m[2]) };
  return weekKey(isoWeekOf(weekStart(w))) === key ? w : null;
}
