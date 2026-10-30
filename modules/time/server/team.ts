import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import type { WeekStatus } from "../contracts";
import { shownDays, weekKey, type IsoWeek } from "../week";
import { weekAnomalies } from "./anomalies";
import { capacityOf } from "./capacity";
import type { WeekRow } from "./weeks";
import { chainFor, entitiesOf, seesWeek } from "./chain";
import { entrySums, hoursOf, latestWeek, projectNames, read, round1, type DayHours } from "./read";

export type TeamRow = {
  weekId: string; userId: string; personName: string; note: string | null; status: WeekStatus; rejectComment: string | null;
  days: number[]; total: number; agentHours: number; canApprove: boolean;
  /** 073 AC-4: the last reminder this person got, by whom and when. */
  lastReminder: { by: string; at: string } | null;
  /** 073 AC-10: what makes the week need individual review (over 60 h, a day over 14 h, missing days). */
  anomalies: string[];
};
export type TeamWeek = { week: IsoWeek; key: string; days: string[]; rows: TeamRow[]; perDay: DayHours[]; projects: { id: string; name: string; hours: number }[]; canAdmin: boolean;
  /** 073 AC-8: allocated hours for the people shown, or null when allocation is unknown. */
  capacity: number | null };

export const teamWeek = (v: Viewer, wanted?: IsoWeek) =>
  read(v, async (tx): Promise<TeamWeek> => {
    const w = wanted ?? (await latestWeek(tx));
    const weeks = await tx.execute(sql`select * from time.week where iso_year = ${w.year} and iso_week = ${w.week} order by created_at, person_name`);
    const sums = await entrySums(tx, w);
    const days = shownDays(w, sums.map((s) => s.day));
    const names = await projectNames(tx);
    const entities = await entitiesOf(tx, weeks.map((wk) => wk.user_id as string));
    const reminded = await lastReminders(tx, weeks.map((wk) => wk.user_id as string));
    const rows = weeks.flatMap((wk): TeamRow[] => {
      const mine = sums.filter((s) => s.week_id === wk.id);
      const projectIds = [...new Set(mine.map((s) => s.project_id))];
      const entity = entities.get(wk.user_id as string) ?? null;
      if (!seesWeek(v, wk.user_id as string, projectIds, entity)) return [];
      const perDay = days.map((d) => hoursOf(mine, (s) => s.day === d));
      return [{ weekId: wk.id as string, userId: wk.user_id as string, personName: wk.person_name as string, note: (wk.note as string | null) ?? null,
        status: wk.status as WeekStatus, rejectComment: (wk.reject_comment as string | null) ?? null, days: perDay, total: round1(perDay.reduce((a, b) => a + b, 0)),
        agentHours: hoursOf(mine, (s) => s.source === "agent"), canApprove: chainFor(v, wk.user_id as string, projectIds, entity) !== null, lastReminder: reminded.get(wk.user_id as string) ?? null, anomalies: [] }];
    });
    // Only a submitted week is up for approval, so only its anomalies are worked out.
    for (const r of rows) if (r.status === "submitted") r.anomalies = await weekAnomalies(tx, weeks.find((wk) => wk.id === r.weekId) as unknown as WeekRow, v);
    const seen = new Set(rows.map((r) => r.weekId));
    const visible = sums.filter((s) => seen.has(s.week_id));
    const perDay = days.map((d) => ({ agent: hoursOf(visible, (s) => s.day === d && s.source === "agent"), person: hoursOf(visible, (s) => s.day === d && s.source === "person") }));
    const byProject = new Map<string, number>();
    for (const s of visible) byProject.set(s.project_id, (byProject.get(s.project_id) ?? 0) + s.hours);
    const projects = [...byProject].map(([id, hours]) => ({ id, name: names.get(id) ?? "Closed project", hours: round1(hours) })).sort((a, b) => b.hours - a.hours);
    return { week: w, key: weekKey(w), days, rows, perDay, projects, canAdmin: can(v, "time:admin"), capacity: await capacityOf(tx, v, w, rows.map((r) => r.userId)) };
  });

/** The newest reminder per person (073 AC-4), for Team time's rows, Not started ones included. */
export async function lastReminders(tx: Tx, userIds: string[]) {
  if (!userIds.length) return new Map<string, { by: string; at: string }>();
  const rows = await tx.execute(sql`select distinct on (user_id) user_id, coalesce(sender_name, 'amax') as by, sent_at from time.reminder
    where user_id::text in (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)}) order by user_id, sent_at desc`);
  return new Map(rows.map((r) => [r.user_id as string, { by: r.by as string, at: new Date(r.sent_at as string).toISOString() }]));
}
