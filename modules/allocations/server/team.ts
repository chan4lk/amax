import type { Tx } from "@amax/db";
import { viewerForUser, type Viewer } from "@amax/auth";
import { getProjectRef, type ProjectRef } from "@amax/delivery/contracts";
import { listEmploymentPeriods, listPeople } from "@amax/hr/contracts";
import { listAllocations, personMonthTotals } from "../contracts";
import { fteIn, windowMonths } from "./months";
import { readAlloc } from "./read";
import { standingOn } from "./standing";

// 081 amendment 6: `userId` (null for someone with no sign-in) lets chat name a person as a proposal's owner.
// 081 amendment 8 (AC-80): `freeThisMonth`, capacity (FTE) less every allocation this month, as the grid counts it; null
// when the reader can't see the person's employment.
/** `standing` (107): on the project until further notice. */
export type TeamMember = { personId: string; userId: string | null; employeeNo: string; name: string; role: string; percents: (number | null)[]; freeThisMonth: number | null; standing: boolean };
/**
 * `manager` (107): the project's PM, led with on the Team page; null when it has none. `inactive` (final pass): the PM's
 * account is no longer active, so the project needs a new one; `name` is then the name the project last recorded.
 */
export type ProjectTeam = { project: ProjectRef; manager: { userId: string; name: string; inactive?: true } | null; months: string[]; people: TeamMember[]; hidden: number };

/** Each person's capacity this month less every allocation that month, as the grid counts it; null without their employment. */
export async function freeIn(tx: Tx, v: Viewer, ids: string[], month: string): Promise<(personId: string) => number | null> {
  const [periods, totals] = await Promise.all([listEmploymentPeriods(tx, v, ids), personMonthTotals(tx, v, { from: month, to: month, personIds: ids })]);
  return (personId) => {
    const mine = periods.filter((x) => x.personId === personId);
    if (!mine.length) return null;
    return Math.round(fteIn(mine, month) * 100) - (totals.rows.find((t) => t.personId === personId)?.percent ?? 0);
  };
}

export async function teamIn(tx: Tx, v: Viewer, projectKey: string, today: Date): Promise<ProjectTeam | null> {
  const project = await getProjectRef(tx, projectKey);
  if (!project) return null;
  const months = windowMonths(today, 3);
  const { rows, hidden } = await listAllocations(tx, v, { from: months[0], to: months[2], projectIds: [project.id] });
  const ids = [...new Set(rows.map((r) => r.personId))];
  const [people, free, standing] = await Promise.all([listPeople(tx, v, { ids }), freeIn(tx, v, ids, months[0]), standingOn(tx, project.id)]);
  const pm = project.managerUserId ? await viewerForUser(tx, v.tenantId, project.managerUserId) : null;
  const manager = !project.managerUserId ? null : pm ? { userId: project.managerUserId, name: pm.name }
    : { userId: project.managerUserId, name: project.managerName ?? "Their PM", inactive: true as const };
  return {
    project, months, hidden, manager,
    people: people.map((p) => ({
      personId: p.id, userId: p.userId, employeeNo: p.employeeNo, name: p.name, role: p.title,
      percents: months.map((m) => rows.find((r) => r.personId === p.id && r.month === m)?.percent ?? null), freeThisMonth: free(p.id), standing: standing.has(p.id),
    })).sort((a, b) => (b.percents[0] ?? 0) - (a.percents[0] ?? 0) || a.name.localeCompare(b.name)),
  };
}

export const teamFor = (v: Viewer, projectKey: string, today = new Date()) => readAlloc(v, (tx) => teamIn(tx, v, projectKey, today));
