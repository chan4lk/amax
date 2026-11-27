import { z } from "zod";
import { dayIn } from "../sync/estimate";

export const CATEGORIES = ["dev", "uat", "prod"] as const;
export type Category = (typeof CATEGORIES)[number];
export type ReleaseStatus = "planned" | "in_progress" | "overdue" | "completed";
export type Completion = "on_time" | "late";

const LABEL: Record<Category, string> = { dev: "Dev", uat: "UAT", prod: "Prod" };
const STATUS_LABEL: Record<ReleaseStatus, string> = { planned: "Planned", in_progress: "In progress", overdue: "Off track", completed: "Completed" };
const isCategory = (c: string): c is Category => (CATEGORIES as readonly string[]).includes(c);

export const categoryLabel = (c: string | null | undefined) => (c ? (isCategory(c.toLowerCase()) ? LABEL[c.toLowerCase() as Category] : c) : undefined);
export const statusLabel = (s: string | null | undefined) => (s ? STATUS_LABEL[s as ReleaseStatus] ?? s : "Untracked");
export const dayLabel = (d: string | null | undefined) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : undefined;

const realDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date is YYYY-MM-DD").refine(realDay, "that date isn't a real calendar day");
export const CategoryInput = z.string().trim().toLowerCase().refine(isCategory, "the category is Dev, UAT or Prod").transform((c) => c as Category);
export const Keys = z.preprocess((v) => (typeof v === "string" ? v.split(",").map((k) => k.trim()).filter(Boolean) : v), z.array(z.string()));
export const ReleaseName = z.string().trim().min(1, "the release needs a name").max(120, "a release name is at most 120 characters");
export const Version = z.string().trim().min(1, "the release needs a version").max(40, "a version is at most 40 characters");
export const Tracking = z.object({ name: ReleaseName, category: CategoryInput, startDate: Day, targetDate: Day });
export type Tracking = z.infer<typeof Tracking>;

export function releaseStatus(s: { today: string; start: string; target: string; completed: boolean }): ReleaseStatus {
  if (s.completed) return "completed";
  if (s.today < s.start) return "planned";
  return s.today > s.target ? "overdue" : "in_progress";
}

export const releaseDay = (zone: string, at: Date | string) => dayIn(zone)(new Date(at).getTime());
export const completionOf = (completedDay: string, target: string): Completion => (completedDay <= target ? "on_time" : "late");
