import { sql } from "drizzle-orm";
import { can, type Viewer } from "@amax/auth";
import type { WeekStatus } from "../contracts";
import { weekKey, workDays, type IsoWeek } from "../week";
import { chainFor, entitiesOf, seesWeek } from "./chain";
import { entrySums, hoursOf, latestWeek, projectNames, read, round1, type DayHours } from "./read";

export type TeamRow = {
  weekId: string; userId: string; personName: string; note: string | null; status: WeekStatus; rejectComment: string | null;
  days: number[]; total: number; agentHours: number; canApprove: boolean;
};
export type TeamWeek = { week: IsoWeek; key: string; days: string[]; rows: TeamRow[]; perDay: DayHours[]; projects: { name: string; hours: number }[]; canAdmin: boolean };

export const teamWeek = (v: Viewer, wanted?: IsoWeek) =>
  read(v, async (tx): Promise<TeamWeek> => {
    const w = wanted ?? (await latestWeek(tx));
    const days = workDays(w);
    const weeks = await tx.execute(sql`select * from time.week where iso_year = ${w.year} and iso_week = ${w.week} order by created_at, person_name`);
    const sums = await entrySums(tx, w);
    const names = await projectNames(tx);
    const entities = await entitiesOf(tx, weeks.map((wk) => wk.user_id as string));
    const rows = weeks.flatMap((wk): TeamRow[] => {
      const mine = sums.filter((s) => s.week_id === wk.id);
      const projectIds = [...new Set(mine.map((s) => s.project_id))];
      const entity = entities.get(wk.user_id as string) ?? null;
      if (!seesWeek(v, wk.user_id as string, projectIds, entity)) return [];
      const perDay = days.map((d) => hoursOf(mine, (s) => s.day === d));
      return [{ weekId: wk.id as string, userId: wk.user_id as string, personName: wk.person_name as string, note: (wk.note as string | null) ?? null,
        status: wk.status as WeekStatus, rejectComment: (wk.reject_comment as string | null) ?? null, days: perDay, total: round1(perDay.reduce((a, b) => a + b, 0)),
        agentHours: hoursOf(mine, (s) => s.source === "agent"), canApprove: chainFor(v, wk.user_id as string, projectIds, entity) !== null }];
    });
    const seen = new Set(rows.map((r) => r.weekId));
    const visible = sums.filter((s) => seen.has(s.week_id));
    const perDay = days.map((d) => ({ agent: hoursOf(visible, (s) => s.day === d && s.source === "agent"), person: hoursOf(visible, (s) => s.day === d && s.source === "person") }));
    const byProject = new Map<string, number>();
    for (const s of visible) byProject.set(s.project_id, (byProject.get(s.project_id) ?? 0) + s.hours);
    const projects = [...byProject].map(([id, hours]) => ({ name: names.get(id) ?? "Closed project", hours: round1(hours) })).sort((a, b) => b.hours - a.hours);
    return { week: w, key: weekKey(w), days, rows, perDay, projects, canAdmin: can(v, "time:admin") };
  });
