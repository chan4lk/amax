import type { EventHandlerDef } from "@amax/core";
import { contextFor } from "@amax/core/server";
import { EVENTS as TIME, parseWeekKey, projectHours, weekStart } from "@amax/time/contracts";
import { billingReader } from "./agent";
import { draftFromTime, monthRange, timeInstalled } from "./drafts";

type Tx = Parameters<EventHandlerDef["handle"]>[0]["tx"];

// 072 AC-1: one recompute of a month's T&M billable hours from approved time. It upserts per contract and period,
// so a retried or repeated event changes nothing; an invoiced period keeps its invoice and the difference is a draft.
async function recompute(tx: Tx, tenantId: string, months: string[]) {
  if (!(await timeInstalled(tx))) return;
  const ctx = contextFor.job(tenantId, "finance.time-agent");
  for (const month of [...new Set(months)]) {
    const hours = await projectHours(tx, billingReader(tenantId), { ...monthRange(month), approvedOnly: true });
    await draftFromTime(ctx, { month, projects: hours.map((h) => ({ projectId: h.projectId, billableHours: h.billableHours })) });
  }
}

const monthsOfWeek = (key: string) => {
  const w = parseWeekKey(key);
  if (!w) return [];
  const start = weekStart(w).getTime();
  return [0, 4].map((n) => new Date(start + n * 86_400_000).toISOString().slice(0, 7));
};

const onWeek = (id: string, event: string): EventHandlerDef => ({
  id, event, handle: ({ tx, tenantId, event: e }) => recompute(tx, tenantId, monthsOfWeek((e.payload as { week: string }).week)),
});
// A change to an approved week: Admin log_time into it, or a change request applied to it (070 AC-34).
const onLockedEntry = (id: string, event: string): EventHandlerDef => ({
  id, event, async handle({ tx, tenantId, event: e }) {
    const p = e.payload as { lockedChange?: boolean; day: string };
    if (p.lockedChange) await recompute(tx, tenantId, [p.day.slice(0, 7)]);
  },
});

export const timeAgent = onWeek("finance.time-agent", TIME.weekApproved);
export const timeHandlers: EventHandlerDef[] = [
  timeAgent,
  onWeek("finance.time-reopened", TIME.weekReopened),
  onLockedEntry("finance.time-locked-logged", TIME.entryLogged),
  onLockedEntry("finance.time-locked-corrected", TIME.entryCorrected),
  onLockedEntry("finance.time-locked-deleted", TIME.entryDeleted),
];
