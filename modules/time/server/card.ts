import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { guardFixable, mayFix } from "./entry";
import { projectNames, read } from "./read";
import { allocationRefusal, dateRefusal } from "./rules";
import type { Tx } from "@amax/db";
import { getProjectRef } from "@amax/delivery/contracts";
import type { WeekRow } from "./weeks";

/**
 * 070 AC-17: what the confirm card shows about the entry, copied from get_timesheet by the model and
 * checked against the stored entry before the card is made, so the person confirms the real values.
 * Optional on the tool, so a direct MCP call can name just the entry; chat's card needs them all.
 */
export const cardFields = {
  project: z.string().optional().describe("The entry's project name, as get_timesheet shows it"),
  day: z.string().optional().describe("The entry's day, YYYY-MM-DD"),
  person: z.string().optional().describe("Whose entry, when it isn't your own"),
  hoursBefore: z.number().optional().describe("The entry's hours now"),
};
export type CardInput = { entryId: string; project?: string; day?: string; person?: string; hoursBefore?: number; projectKey?: string };

export type StoredEntry = { userId: string; projectId: string; projectName: string; day: string; hours: number; billable: boolean; note: string | null; personName: string; own: boolean; entity: string | null; week: WeekRow };

// 071 AC-10: moving an entry to another project needs an allocation there, as logging does.
async function movedRefusal(tx: Tx, v: Viewer, e: StoredEntry, projectKey: string | undefined) {
  const to = projectKey ? await getProjectRef(tx, projectKey) : null;
  return to && to.id !== e.projectId ? allocationRefusal(tx, v.tenantId, e.userId, to.id, e.day) : null;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export const refuse = (message: string): never => { throw new ToolError(message, "invalid_input"); };

/** The live entry the viewer may fix, with its week; anything else is one "no such entry" refusal. */
export async function storedEntry(v: Viewer, entryId: string): Promise<StoredEntry> {
  const found = await read(v, async (tx) => {
    const [e] = await tx.execute(sql`select e.user_id, e.project_id, to_char(e.day, 'YYYY-MM-DD') as day, e.hours, e.billable, e.note, w.person_name, row_to_json(w) as week, u.legal_entity_id
      from time.entry e join time.week w on w.id = e.week_id join auth.user u on u.id = e.user_id where e.id = ${entryId} and e.deleted_at is null`);
    return e && { userId: e.user_id as string, projectId: e.project_id as string, day: e.day as string, hours: Number(e.hours), billable: e.billable as boolean, note: e.note as string | null,
      personName: e.person_name as string, own: e.user_id === v.userId, entity: (e.legal_entity_id as string | null) ?? null, week: e.week as WeekRow, projectName: (await projectNames(tx)).get(e.project_id as string) ?? "Closed project" };
  });
  if (!found || !mayFix(v, found.userId, found.projectId, found.entity)) return refuse("there's no such entry you can change; read it with get_timesheet first");
  return found;
}

/** 070 AC-17 and amendment 2: no card for a week that can't change, or one that doesn't match the entry. */
export async function checkCard(v: Viewer, a: CardInput) {
  const found = await storedEntry(v, a.entryId);
  try { guardFixable(found.week); } catch (e) { refuse((e as Error).message); }
  const rule = await read(v, async (tx) => (found.own ? await dateRefusal(tx, found.userId, found.day) : null) ?? (await movedRefusal(tx, v, found, a.projectKey)));
  if (rule) refuse(rule);
  const wrong = [
    !same(a.project ?? "", found.projectName) && `project is ${found.projectName}`,
    a.day !== found.day && `day is ${found.day}`,
    found.hours !== a.hoursBefore && `hoursBefore is ${found.hours}`,
    !found.own && !same(a.person ?? "", found.personName) && `person is ${found.personName}`,
  ].filter(Boolean);
  if (wrong.length) refuse(`the card must match the entry: ${wrong.join(", ")}`);
}
