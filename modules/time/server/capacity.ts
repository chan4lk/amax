import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { personMonthTotals } from "@amax/allocations/contracts";
import { personIdsForUser } from "@amax/hr/contracts";
import { workDays, type IsoWeek } from "../week";
import { allocationsInstalled } from "./rules";
import { targetsOf } from "./targets";

/**
 * 073 AC-8: the hours the people on ThisWeek are allocated for the week: each working day, their allocated percent
 * that month × their weekly target (072) ÷ 5. Null ("allocation unknown") when Allocations isn't installed, or anyone
 * on the card has no HR record or allocations the viewer can't read.
 */
export async function capacityOf(tx: Tx, v: Viewer, w: IsoWeek, userIds: string[]): Promise<number | null> {
  if (!userIds.length || !(await allocationsInstalled(tx))) return null;
  const people = new Map<string, string>();
  for (const id of userIds) {
    const [personId] = await personIdsForUser(tx, id);
    if (!personId) return null;
    people.set(id, personId);
  }
  const days = workDays(w);
  const { rows, hidden } = await personMonthTotals(tx, v, { from: days[0], to: days[4], personIds: [...people.values()] });
  if (hidden) return null;
  const targets = await targetsOf(tx, userIds);
  let hours = 0;
  for (const [userId, personId] of people) for (const day of days) {
    const percent = rows.find((r) => r.personId === personId && r.month === `${day.slice(0, 7)}-01`)?.percent ?? 0;
    hours += (percent / 100) * (targets.get(userId)! / 5);
  }
  return Math.round(hours * 10) / 10;
}
