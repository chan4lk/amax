import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { listProjectRefs } from "@amax/delivery/contracts";
import type { WeekStatus } from "../contracts";
import { shownDays, weekKey, type IsoWeek } from "../week";
import { targetsOf } from "./targets";
import { entrySums, hoursOf, latestWeek, projectNames, read, weekEntries, type EntryLine } from "./read";

export type MyRow = { projectName: string; days: number[]; total: number };
export type MyWeek = {
  week: IsoWeek; key: string; days: string[]; status: WeekStatus | null; note: string | null; rejectComment: string | null;
  rows: MyRow[]; entries: EntryLine[]; perDay: number[]; total: number; agentHours: number; projects: { key: string; name: string }[];
  /** 072 AC-9: the week's hours against the person's target (40 h unless an Admin set one), as a whole %. */
  target: number; utilisation: number;
};

export const myWeek = (v: Viewer, wanted?: IsoWeek) =>
  read(v, async (tx): Promise<MyWeek> => {
    const w = wanted ?? (await latestWeek(tx, v.userId));
    const [wk] = await tx.execute(sql`select * from time.week where user_id = ${v.userId} and iso_year = ${w.year} and iso_week = ${w.week}`);
    const sums = await entrySums(tx, w, v.userId);
    const days = shownDays(w, sums.map((s) => s.day));
    const names = await projectNames(tx);
    const rows = [...new Set(sums.map((s) => s.project_id))].map((id) => {
      const perDay = days.map((d) => hoursOf(sums, (s) => s.project_id === id && s.day === d));
      return { projectName: names.get(id) ?? "Closed project", days: perDay, total: hoursOf(sums, (s) => s.project_id === id) };
    }).sort((a, b) => b.total - a.total);
    return {
      week: w, key: weekKey(w), days, status: (wk?.status as WeekStatus | undefined) ?? null, note: (wk?.note as string | null) ?? null,
      rejectComment: (wk?.reject_comment as string | null) ?? null, rows, entries: wk ? await weekEntries(tx, wk.id as string, names) : [], perDay: days.map((d) => hoursOf(sums, (s) => s.day === d)),
      total: hoursOf(sums, () => true), agentHours: hoursOf(sums, (s) => s.source === "agent"), ...(await utilisationOf(tx, v.userId, hoursOf(sums, () => true))),
      projects: (await listProjectRefs(tx)).map((p) => ({ key: p.key, name: p.name })),
    };
  });

async function utilisationOf(tx: Parameters<Parameters<typeof read>[1]>[0], userId: string, total: number) {
  const target = (await targetsOf(tx, [userId])).get(userId)!;
  return { target, utilisation: Math.round((total / target) * 100) };
}
