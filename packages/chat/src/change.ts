import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Db } from "@amax/db";
import { traceStep, withTrace } from "@amax/core/server";
import type { Registry } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import { isExpired, NotPendingError, titleOf, traceFor, type Decision, type PendingAction } from "./engine";

const percentOf = z.number().int().min(0).max(200);

export async function editAction(db: Db, registry: Registry, viewer: Viewer, conversationId: string, actionId: string, changes: Record<string, unknown>) {
  const next = await withTenant(db, viewer.tenantId, async (tx) => {
    const [row] = await tx.execute(sql`select pending, decided from chat.conversation where id = ${conversationId} and user_id = ${viewer.userId} for update`);
    if (!row) throw new Error("conversation not found");
    const list = row.pending as PendingAction[];
    const action = list.find((p) => p.id === actionId);
    if (!action) throw new NotPendingError((row.decided as Record<string, Decision>)[actionId] ?? null);
    const tool = registry.toolsFor(viewer).find((t) => t.name === action.tool);
    if (!tool || isExpired(action) || action.secret) throw new Error("that card can't be changed any more");
    const input = { ...action.input, ...changes };
    const checked = (tool.input as z.ZodType).safeParse(input);
    if (!checked.success) throw new Error(`that change doesn't fit the card: ${checked.error.issues[0]?.message ?? "invalid"}`);
    const changed = { ...action, input, fields: Object.keys(input), title: titleOf(tool, input) };
    await tx.execute(sql`update chat.conversation set pending = ${JSON.stringify(list.map((p) => (p.id === actionId ? changed : p)))}::jsonb, updated_at = now() where id = ${conversationId}`);
    return changed;
  });
  await withTrace(traceFor(viewer, next.traceId), () => traceStep({ kind: "pending", tool: next.tool, args: next.input, detail: { actionId, changed: Object.keys(changes).join(",") } }));
  return next;
}

export const changeAction = async (db: Db, registry: Registry, viewer: Viewer, conversationId: string, actionId: string, percent: number) =>
  editAction(db, registry, viewer, conversationId, actionId, { percent: percentOf.parse(percent) });
