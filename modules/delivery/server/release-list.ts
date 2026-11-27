import { z } from "zod";

export const STATUS_FILTERS = [["", "All"], ["planned", "Planned"], ["in_progress", "In progress"], ["overdue", "Off track"], ["completed", "Completed"], ["untracked", "Untracked"]] as const;
export const CATEGORY_FILTERS = [["", "All"], ["dev", "Dev"], ["uat", "UAT"], ["prod", "Prod"]] as const;
export const SORTS = [["", "Newest"], ["start", "Start date"], ["target", "Target date"]] as const;

const one = <T extends readonly (readonly [string, string])[]>(list: T) => z.enum(list.map(([v]) => v).filter(Boolean) as [string, ...string[]]);
export const ReleaseFilter = z.object({ status: one(STATUS_FILTERS).optional(), category: one(CATEGORY_FILTERS).optional(), sort: one(SORTS).optional() });
export type ReleaseFilter = z.infer<typeof ReleaseFilter>;

export const filterOf = (sp: Record<string, string | undefined>): ReleaseFilter => {
  const pick = (key: keyof ReleaseFilter) => (ReleaseFilter.shape[key].safeParse(sp[key]).success ? sp[key] : undefined);
  return { status: pick("status"), category: pick("category"), sort: pick("sort") } as ReleaseFilter;
};

type Listed = { status?: string | null; category?: string | null; startDate?: string | null; targetDate?: string | null };

const matches = (r: Listed, f: ReleaseFilter) =>
  (!f.status || (f.status === "untracked" ? !r.status : r.status === f.status)) && (!f.category || r.category === f.category);

const byDate = (key: "startDate" | "targetDate") => (a: Listed, b: Listed) => {
  const x = a[key], y = b[key];
  return x && y ? x.localeCompare(y) : x ? -1 : y ? 1 : 0;
};

export function filterReleases<T extends Listed>(rows: T[], f: ReleaseFilter): T[] {
  const kept = rows.filter((r) => matches(r, f));
  return f.sort ? [...kept].sort(byDate(f.sort === "start" ? "startDate" : "targetDate")) : kept;
}

export const filtered = (f: ReleaseFilter) => Boolean(f.status || f.category);

export function listHref(root: string, keep: Record<string, string | undefined>, change: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  for (const k of ["map", "status", "category", "sort"]) {
    const v = k in change ? change[k] : keep[k];
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `${root}?${s}` : root;
}
