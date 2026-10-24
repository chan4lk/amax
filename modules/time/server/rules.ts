import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { listAllocations } from "@amax/allocations/contracts";
import { personIdsForUser } from "@amax/hr/contracts";
import { entityZone } from "@amax/workflows";
import { dayLabel, isoWeekOf, shiftWeek, weekStart } from "../week";
import { entityOf } from "./chain";
import { projectNames } from "./read";

// 071 AC-9 to AC-11: the tenant's entry rules. With no row, or every default, nothing changes from before 071.
export type TimeSettings = { requireAllocation: boolean; backdateWeeks: number | null; allowFuture: boolean };
export const DEFAULTS: TimeSettings = { requireAllocation: false, backdateWeeks: null, allowFuture: true };

export async function settingsOf(tx: Tx): Promise<TimeSettings> {
  const [r] = await tx.execute(sql`select require_allocation, backdate_weeks, allow_future from time.setting`);
  return r ? { requireAllocation: Boolean(r.require_allocation), backdateWeeks: (r.backdate_weeks as number | null) ?? null, allowFuture: Boolean(r.allow_future) } : DEFAULTS;
}

export const allocationsInstalled = async (tx: Tx) => Boolean((await tx.execute(sql`select to_regclass('allocations.allocation') is not null as on`))[0]?.on);

const month = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]);

/** AC-10: why this person can't log to this project on this day (allocated in that month), or null. */
export async function allocationRefusal(tx: Tx, tenantId: string, userId: string, projectId: string, day: string): Promise<string | null> {
  if (!(await settingsOf(tx)).requireAllocation) return null;
  if (!(await allocationsInstalled(tx))) return "time needs an allocation, but allocations aren't available; ask an Admin";
  const people = await personIdsForUser(tx, userId);
  const names = await projectNames(tx);
  const project = names.get(projectId) ?? "that project";
  if (!people.length) return `there's no HR record for this person, so no allocation to ${project}; ask a PM or Admin`;
  const { rows } = await listAllocations(tx, contextFor.job(tenantId, "time.allocation-check"), { from: day, to: day, personIds: people });
  const allocated = [...new Set(rows.flatMap((r) => (r.projectId ? [r.projectId] : [])))];
  if (allocated.includes(projectId)) return null;
  const options = allocated.map((id) => names.get(id)).filter((n): n is string => Boolean(n));
  return `not allocated to ${project} in ${month(day)}` + (options.length ? `; allocated to ${list(options)} that month, so choose one of those` : "; ask a PM or Admin for an allocation");
}

/** The person's date now, in their legal entity's time zone (UTC when unknown). */
export async function localToday(tx: Tx, userId: string) {
  const zone = await entityZone(tx, await entityOf(tx, userId));
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** AC-11: why the owner can't change this day (outside the back-dating limit, or in the future), or null. */
export async function dateRefusal(tx: Tx, userId: string, day: string): Promise<string | null> {
  const s = await settingsOf(tx);
  if (s.backdateWeeks === null && s.allowFuture) return null;
  const today = await localToday(tx, userId);
  if (!s.allowFuture && day > today) return `${dayLabel(day)} is in the future; log time once the day has come`;
  if (s.backdateWeeks !== null) {
    const earliest = weekStart(shiftWeek(isoWeekOf(new Date(`${today}T00:00:00Z`)), -s.backdateWeeks)).toISOString().slice(0, 10);
    if (day < earliest) return `time can be logged up to ${s.backdateWeeks} week${s.backdateWeeks === 1 ? "" : "s"} back, so ${dayLabel(day)} is too early; ask your PM to add it with a reason`;
  }
  return null;
}
