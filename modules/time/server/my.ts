import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { Tx } from "@amax/db";
import { listProjectRefs } from "@amax/delivery/contracts";
import type { WeekStatus } from "../contracts";
import { shownDays, weekKey, type IsoWeek } from "../week";
import { exactWeekHours, targetsOf, weekFigures } from "./targets";
import { entrySums, hoursOf, latestWeek, projectNames, read, weekEntries, type EntryLine } from "./read";

export type MyRow = { projectId: string; projectName: string; days: number[]; total: number };
export type MyWeek = {
  week: IsoWeek; key: string; days: string[]; status: WeekStatus | null; note: string | null; rejectComment: string | null;
  /** 073: who sent the week back and when, for the sent-back card. */
  rejectedBy: string | null; rejectedAt: string | null;
  rows: MyRow[]; entries: EntryLine[]; perDay: number[]; total: number; agentHours: number; projects: { key: string; name: string }[];
  /** 072 AC-9: the week's hours against the person's target (40 h unless an Admin set one), as a whole %. */
  target: number; utilisation: number;
};

// `decided_by` is "user:<id>" (or "<actor> for <person>"); the card names the person.
async function decider(tx: Tx, wk: Record<string, unknown> | undefined) {
  if (!wk || wk.status !== "rejected") return { rejectedBy: null, rejectedAt: null };
  const id = String(wk.decided_by ?? "").replace(/^user:/, "").split(" ")[0];
  const [u] = id ? await tx.execute(sql`select name from auth.user where id::text = ${id}`) : [];
  return { rejectedBy: (u?.name as string | undefined) ?? null, rejectedAt: wk.decided_at ? new Date(wk.decided_at as string).toISOString() : null };
}

export const myWeek = (v: Viewer, wanted?: IsoWeek) =>
  read(v, async (tx): Promise<MyWeek> => {
    const w = wanted ?? (await latestWeek(tx, v.userId));
    const [wk] = await tx.execute(sql`select * from time.week where user_id = ${v.userId} and iso_year = ${w.year} and iso_week = ${w.week}`);
    const sums = await entrySums(tx, w, v.userId);
    const days = shownDays(w, sums.map((s) => s.day));
    const names = await projectNames(tx);
    const rows = [...new Set(sums.map((s) => s.project_id))].map((id) => {
      const perDay = days.map((d) => hoursOf(sums, (s) => s.project_id === id && s.day === d));
      return { projectId: id, projectName: names.get(id) ?? "Closed project", days: perDay, total: hoursOf(sums, (s) => s.project_id === id) };
    }).sort((a, b) => b.total - a.total);
    return {
      week: w, key: weekKey(w), days, status: (wk?.status as WeekStatus | undefined) ?? null, note: (wk?.note as string | null) ?? null,
      rejectComment: (wk?.reject_comment as string | null) ?? null, ...(await decider(tx, wk)), rows, entries: wk ? await weekEntries(tx, wk.id as string, names) : [], perDay: days.map((d) => hoursOf(sums, (s) => s.day === d)),
      total: hoursOf(sums, () => true), agentHours: hoursOf(sums, (s) => s.source === "agent"), ...(await utilisationOf(tx, v.userId, w, (wk?.status as string | undefined) ?? null)),
      projects: (await listProjectRefs(tx)).map((p) => ({ key: p.key, name: p.name })),
    };
  });

// The same figures get_week_utilisation shows (review round 1): one rule, weekFigures.
async function utilisationOf(tx: Parameters<Parameters<typeof read>[1]>[0], userId: string, w: IsoWeek, status: string | null) {
  const f = weekFigures((await exactWeekHours(tx, [userId], w)).get(userId)!, status, (await targetsOf(tx, [userId])).get(userId)!);
  return { target: f.target, utilisation: f.utilisation };
}
