import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { can, ScopeError, viewerOf, type Viewer } from "@amax/auth";
import { ValidationError, type ServiceContext } from "@amax/core/server";
import { entityOf, inEntity, type Entity } from "./chain";
import { projectNames } from "./read";
import { actorId, keyOf, type WeekRow } from "./weeks";

export type EntryRow = { id: string; week_id: string; user_id: string; project_id: string; day: string; hours: number; billable: boolean; note: string | null; revision: number };

/** 070 AC-14: the owner, a PM who approves the project (Admins included), or nobody; 071 AC-4: in the owner's entity. */
export const mayFix = (v: Viewer, ownerUserId: string, projectId: string, entity: Entity) => ownerUserId === v.userId ? can(v, "time:log", { ownerUserId })
  : can(v, "time:log", { ownerUserId, ...inEntity(entity) }) || can(v, "time:approve", { projectId, ...inEntity(entity) });

/**
 * 070: one live entry and its week, locked, for a correction or a delete. The caller is checked before
 * any lock, and a missing, deleted or out-of-scope entry all give the same error.
 */
export async function lockedEntry(tx: Tx, ctx: ServiceContext, entryId: string): Promise<{ week: WeekRow; entry: EntryRow }> {
  const [owner] = await tx.execute(sql`select e.user_id, e.project_id, u.legal_entity_id from time.entry e join auth.user u on u.id = e.user_id where e.id = ${entryId} and e.deleted_at is null`);
  const v = viewerOf(ctx);
  if (!owner || (v && !mayFix(v, owner.user_id as string, owner.project_id as string, (owner.legal_entity_id as string | null) ?? null))) throw new ScopeError("time:log");
  const [week] = await tx.execute(sql`select w.* from time.week w join time.entry e on e.week_id = w.id where e.id = ${entryId} for update of w`);
  const entry = await liveEntry(tx, entryId);
  if (!week || !entry) throw new ScopeError("time:log");
  return { week: week as WeekRow, entry };
}

/** One live entry, locked for update; null when it doesn't exist or is deleted. */
export async function liveEntry(tx: Tx, entryId: string): Promise<EntryRow | null> {
  const [e] = await tx.execute(sql`select id, week_id, user_id, project_id, to_char(day, 'YYYY-MM-DD') as day, hours, billable, note, revision
    from time.entry where id = ${entryId} and deleted_at is null for update`);
  return e ? { ...(e as unknown as EntryRow), hours: Number(e.hours), revision: Number(e.revision) } : null;
}

/** 070 AC-13: corrections and deletes touch draft and rejected weeks only; an approved week is reopened first. */
export function guardFixable(week: WeekRow) {
  if (week.status === "submitted") throw new Error(`${keyOf(week)} is submitted and waiting for approval; ask the approver to send it back before changing it, or ask for the change with request_time_change`);
  if (week.status === "approved") throw new Error(`${keyOf(week)} is approved and locked; reopen it with a reason (reopen_week) to change it, or ask for the change with request_time_change`);
}

export type FixedBy = { by: string; byOther: boolean; reason: string | null; projectName: string };

/** 070 AC-14: who is fixing the entry; someone else's needs the new project in scope too, and a reason. */
export async function fixedBy(tx: Tx, ctx: ServiceContext, entry: EntryRow, projectId: string, reason: string | undefined): Promise<FixedBy> {
  const v = viewerOf(ctx);
  if (v && !mayFix(v, entry.user_id, projectId, await entityOf(tx, entry.user_id))) throw new ScopeError("time:log");
  const actor = actorId(ctx);
  const byOther = actor !== entry.user_id;
  if (byOther && !reason) throw new ValidationError([{ code: "custom", path: ["reason"], message: "is required when you change someone else's time", input: undefined }]);
  const projectName = (await projectNames(tx)).get(projectId) ?? "a closed project";
  return { by: actor, byOther, reason: reason ?? null, projectName };
}
