import { sql } from "drizzle-orm";
import { z } from "zod";
import { assertCan, viewerForUser, viewerOf, type Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { defineService, getRuntime } from "@amax/core/server";
import { withTenant, type Tx } from "@amax/db";
import { ToolError } from "@amax/mcp";
import { EVENTS, type ProjectManagerChanged } from "../contracts";
import { invalid, notFound } from "./refusal";

export const MANAGE = "delivery:project:manage";
export const ManagerInput = z.object({ projectKey: z.string(), userId: z.string().uuid() });
type Input = z.infer<typeof ManagerInput>;

/** `lock` (final pass): the handover reads its project under a row lock, so two at once run one after the other. */
const projectOf = async (tx: Tx, key: string, lock = false) =>
  (await tx.execute(sql`select id, key, name, manager_user_id from delivery.project where key = ${key} ${lock ? sql`for update` : sql``}`))[0];
const nameOf = async (tx: Tx, tenantId: string, userId: string | null) => (userId ? (await viewerForUser(tx, tenantId, userId))?.name ?? null : null);

/** Review round 1: a project's PM rights come from the PM role, so only someone who holds PM (or Admin) can be its manager. */
async function newManager(tx: Tx, tenantId: string, userId: string): Promise<{ name: string } | { refused: string }> {
  const v = await viewerForUser(tx, tenantId, userId);
  if (!v) return { refused: "the new PM must be an active person in this workspace" };
  if (!v.actualRoles.some((r) => r === "PM" || r === "Admin")) return { refused: `${v.name} doesn't hold the PM role, so they couldn't manage it; an Admin gives them PM first` };
  return { name: v.name };
}

/** 107 AC-1: an Admin, or the project's current manager, makes an active person its manager. */
export const setProjectManager = defineService({
  scoped: true,
  name: "delivery.project.manager",
  action: MANAGE,
  resource: "delivery.project",
  input: ManagerInput,
  async run(tx, input, ctx) {
    const p = await projectOf(tx, input.projectKey, true);
    if (!p) throw notFound(`no project ${input.projectKey}`);
    const v = viewerOf(ctx);
    if (v) assertCan(v, MANAGE, { projectId: p.id as string });
    const next = await newManager(tx, ctx.tenantId, input.userId);
    if ("refused" in next) throw invalid(next.refused);
    const toName = next.name;
    const from = (p.manager_user_id as string | null) ?? null;
    if (from === input.userId) throw invalid(`${toName} is already the PM of ${input.projectKey}`);
    await tx.execute(sql`update delivery.project set manager_user_id = ${input.userId}, manager_name = ${toName} where id = ${p.id}`);
    const payload: ProjectManagerChanged = { projectId: p.id as string, key: p.key as string, name: p.name as string, from, to: input.userId, toName, by: ctx.actor.id };
    return { result: { projectKey: input.projectKey, manager: toName }, resourceId: p.id as string, before: { managerUserId: from }, after: { managerUserId: input.userId }, events: [{ name: EVENTS.projectManagerChanged, payload }] };
  },
});

const read = <T>(v: Viewer, fn: (tx: Tx) => Promise<T>) => withTenant(getRuntime().db, v.tenantId, fn);

export const proposeManager = (v: Viewer, a: Input) => read(v, async (tx) => {
  const next = await newManager(tx, v.tenantId, a.userId);
  if ("refused" in next) throw new ToolError(next.refused, "invalid_input", "userId");
});

export const managerCard = (v: Viewer, a: Input): Promise<ToolCard> => read(v, async (tx) => {
  const p = await projectOf(tx, a.projectKey);
  const [to, was] = await Promise.all([nameOf(tx, v.tenantId, a.userId), nameOf(tx, v.tenantId, (p?.manager_user_id as string | null) ?? null)]);
  const title = `Make ${to ?? "them"} the PM of ${a.projectKey}${was ? ` (was ${was})` : ""}`;
  return { title, lines: [], look: { kind: "Hand over the PM", subject: title, confirm: "Make PM", done: `Done: ${to} is the PM of ${a.projectKey}` } };
});
