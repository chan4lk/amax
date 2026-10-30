import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { hasModule } from "@amax/core/server";
import { approvedLeave, leaveVisibleTo, type ApprovedLeave } from "@amax/leave/contracts";
import { dayLabel, weekKey, workDays, type IsoWeek } from "../week";
import { entitiesOf } from "./chain";
import { myWeek } from "./my";
import { read } from "./read";
import { localToday } from "./rules";
import { exactWeekHours, targetsOf, weekFigures } from "./targets";
import { notStarted } from "./grid-rows";
import { teamWeek } from "./team";

export type WeekUtilisation = {
  person: string; userId: string; week: string; status: string; hours: number; target: number; utilisation: number; overtime: boolean; missingDays: string[];
  leaveDays?: number; adjustedTarget?: number; adjustedUtilisation?: number;
  /** false when Leave is installed but this person's leave isn't the viewer's to see: missingDays may then be leave. */
  leaveVisible?: boolean;
};
type Person = { userId: string; name: string; status: string; days: number[] };

const pct = (hours: number, target: number) => (target > 0 ? Math.round((hours / target) * 100) : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

// A day's share of approved leave: a whole day, or half of one.
function leaveOn(leave: ApprovedLeave[], userId: string, day: string) {
  const l = leave.find((x) => x.userId === userId && x.startsOn <= day && x.endsOn >= day);
  return l ? (l.halfDay ? 0.5 : 1) : 0;
}

// Leave is optional: installed in this deployment (hasModule), and its tables there (072 review round 3).
async function leaveIn(tx: Tx, v: Viewer, days: string[]) {
  const on = hasModule("leave", Boolean((await tx.execute(sql`select to_regclass('leave.request') is not null as on`))[0]?.on));
  return on ? approvedLeave(tx, v, { from: days[0], to: days[days.length - 1] }) : null;
}

/**
 * 072 AC-8: weekly utilisation for the people the viewer may see (071's week scope; an Engineer, only themself):
 * hours logged against their target, overtime above 100%, the working days so far with nothing logged, and, with
 * Leave, the target less approved leave. A sent-back week counts no hours (D4). Lowest first. 073: people the viewer
 * expects to log who have no timesheet that week (Not started on Team time) are included at 0 h, so they are never missed.
 */
export async function weekUtilisation(v: Viewer, wanted?: IsoWeek, below?: number): Promise<WeekUtilisation[]> {
  const team = await teamWeek(v, wanted);
  const mine = await myWeek(v, team.week);
  const people: Person[] = [
    ...(mine.status ? [{ userId: v.userId, name: v.name, status: mine.status, days: mine.perDay }] : []),
    ...team.rows.map((r) => ({ userId: r.userId, name: r.personName, status: r.status, days: r.days })),
  ];
  const days = workDays(team.week);
  const rows = await read(v, async (tx) => {
    const none = (await notStarted(tx, v, team)).filter((p) => p.userId !== v.userId && !people.some((x) => x.userId === p.userId));
    people.push(...none.map((p) => ({ userId: p.userId, name: p.name, status: "not_started", days: days.map(() => 0) })));
    const targets = await targetsOf(tx, people.map((p) => p.userId));
    // Exact sums (the screens round each day to 0.1 h, which would move a 44.8 h week to 45 h), the same query My week uses.
    const exact = await exactWeekHours(tx, people.map((p) => p.userId), team.week);
    const leave = await leaveIn(tx, v, days);
    // 072 review round 1: leave the viewer can't see reads as "not visible", never as "no leave".
    const entities = leave ? await entitiesOf(tx, people.map((p) => p.userId)) : new Map();
    const out: WeekUtilisation[] = [];
    for (const p of people) {
      const today = await localToday(tx, p.userId);
      const { hours, target, utilisation, overtime } = weekFigures(exact.get(p.userId) ?? 0, p.status, targets.get(p.userId)!);
      const off = leave ? days.reduce((n, d) => n + leaveOn(leave, p.userId, d), 0) : 0;
      const missingDays = days.filter((d, i) => d < today && p.days[i] === 0 && !(leave && leaveOn(leave, p.userId, d))).map(dayLabel);
      const row: WeekUtilisation = { person: p.name, userId: p.userId, week: weekKey(team.week), status: p.status, hours, target, utilisation, overtime, missingDays };
      if (off) { const adjusted = round1(target - (off * target) / 5); Object.assign(row, { leaveDays: off, adjustedTarget: adjusted, adjustedUtilisation: pct(hours, adjusted) }); }
      if (leave && !leaveVisibleTo(v, { userId: p.userId, legalEntityId: entities.get(p.userId) ?? null })) row.leaveVisible = false;
      out.push(row);
    }
    return out;
  });
  return rows.filter((r) => below === undefined || r.utilisation < below).sort((a, b) => a.utilisation - b.utilisation || a.person.localeCompare(b.person));
}
