import { sql } from "drizzle-orm";
import { agentFirstRefusal, agentFirstSql } from "./agent-first";
import { withTenant } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { getRuntime } from "@amax/core/server";
import { ToolError } from "@amax/mcp";
import { notOnProject } from "./owner";
import { ownerShownIn } from "./readiness";

type Create = { projectKey: string; title: string; description?: string; estimateHours?: number; ownerUserId?: string };

const facts = (v: Viewer, a: Create) => withTenant(getRuntime().db, v.tenantId, async (tx) => {
  const [project] = await tx.execute(sql`select p.id, p.name, p.status, p.repo_url, ${agentFirstSql(sql`p`)} as agent_first from delivery.project p where p.key = ${a.projectKey}`);
  const [owner] = await tx.execute(sql`select name from auth.user where id::text = ${a.ownerUserId ?? v.userId} and status = 'active'`);
  return { project, owner: (owner?.name as string | undefined) ?? null };
});

/** 081 AC-13: no card for a proposal that would be refused: an unknown or closed project, or one the viewer can't add to. */
export async function proposeCreate(v: Viewer, a: Create) {
  const { project, owner } = await facts(v, a);
  if (!project) throw new ToolError(`there's no project ${a.projectKey}; list_projects shows the keys`, "invalid_input");
  if (project.status !== "active") throw new ToolError(`${project.name as string} is closed; reopen it before adding proposals`, "invalid_input");
  // 094 AC-6: permission first, so a viewer who can't add there isn't told where the project's repo is.
  if (!can(v, "delivery:proposal:create", { projectId: project.id as string })) throw new ToolError(`you can't add proposals to ${project.name as string}`, "invalid_input");
  // 093 AC-3: no card for an agent-first project; its proposals come from its repo.
  if (project.agent_first) throw new ToolError(agentFirstRefusal(a.projectKey, project.repo_url as string), "invalid_input");
  if (a.ownerUserId && !owner) throw new ToolError("the owner must be an active person in this workspace", "invalid_input");
  await refuseOffProject(v, a.ownerUserId, project.id as string);
}

/** 081 AC-67: no card for an owner who isn't on the proposal's project. */
async function refuseOffProject(v: Viewer, ownerUserId: string | undefined, projectId: string, key?: string) {
  if (!ownerUserId) return;
  const why = await withTenant(getRuntime().db, v.tenantId, (tx) => notOnProject(tx, v.tenantId, ownerUserId, projectId, key));
  if (why) throw new ToolError(why, "invalid_input");
}

export async function proposeUpdate(v: Viewer, a: { key: string; ownerUserId?: string }) {
  if (!a.ownerUserId) return;
  const [p] = await withTenant(getRuntime().db, v.tenantId, (tx) => tx.execute(sql`select project_id from delivery.proposal where key = ${a.key}`));
  if (p) await refuseOffProject(v, a.ownerUserId, p.project_id as string, a.key);
}

/** 081 AC-14: the create card shows what will be written: project, title, description, estimate and owner. */
export async function createProposalCard(v: Viewer, a: Create): Promise<ToolCard> {
  const { project, owner } = await facts(v, a);
  const name = (project?.name as string | undefined) ?? a.projectKey;
  const who = a.ownerUserId && a.ownerUserId !== v.userId ? owner ?? "Unknown person" : "You";
  return {
    title: `New proposal in ${name}: ${a.title}`,
    look: { kind: "New proposal", subject: a.title, detail: name, who: `owned by ${who === "You" ? "you" : who}` },
    lines: [
      { label: "Project", value: `${name} (${a.projectKey})` },
      { label: "Title", value: a.title },
      ...(a.description ? [{ label: "Description", value: a.description }] : []),
      { label: "Estimate", value: a.estimateHours !== undefined ? `${a.estimateHours} h` : "none" },
      // 081 AC-70: someone else named as owner hears of it.
      { label: "Owner", value: who === "You" ? who : `${who} · they'll be told` },
      { label: "Starts as", value: "Proposed" },
    ],
  };
}

// 081 amendment 2: the cards for the writes a pinned proposal suggests (move, add a task, owner), so the card says what
// will happen and its receipt says what did ("Moved CON-016 to Planned"), not chat's generic "Done: CON-016 added".
const PHASE_LABEL: Record<string, string> = { proposed: "Proposed", planned: "Planned", building: "Building", verified: "Verified", released: "Released" };
const proposalNow = (v: Viewer, key: string) => withTenant(getRuntime().db, v.tenantId, async (tx) =>
  (await tx.execute(sql`select key, title, phase, ${ownerShownIn("p")} as owner_name, owner_user_id, (select coalesce(max(substring(ref from 2)::int), 0) + 1 from delivery.task t where t.proposal_id = p.id) as next
    from delivery.proposal p where key = ${key}`))[0]);

export async function moveCard(v: Viewer, a: { key: string; to: string }): Promise<ToolCard> {
  const p = await proposalNow(v, a.key);
  const to = PHASE_LABEL[a.to] ?? a.to, from = p ? PHASE_LABEL[p.phase as string] ?? String(p.phase) : "–";
  return { title: `Move ${a.key} to ${to}`, lines: [{ label: "Proposal", value: p ? `${a.key} ${p.title as string}` : a.key }, { label: "From", value: from }, { label: "To", value: to }],
    look: { kind: "Move proposal", subject: p ? `${a.key} ${p.title as string}` : a.key, detail: `${from} → ${to}`, confirm: `Move to ${to}`, done: `Moved ${a.key} to ${to}` } };
}

export async function taskCard(v: Viewer, a: { key: string; title: string }): Promise<ToolCard> {
  const p = await proposalNow(v, a.key);
  const ref = p ? `T${Number(p.next)}` : "a new task";
  return { title: `Add ${ref} to ${a.key}: ${a.title}`, lines: [{ label: "Proposal", value: p ? `${a.key} ${p.title as string}` : a.key }, { label: "Task", value: `${ref} ${a.title}` }],
    look: { kind: "Add a task", subject: a.title, detail: p ? `${a.key} ${p.title as string}` : a.key, confirm: "Add the task", done: `Added ${ref} to ${a.key}` } };
}

type Edit = { key: string; title?: string; description?: string | null; estimateHours?: number | null; ownerUserId?: string };
export async function updateCard(v: Viewer, a: Edit): Promise<ToolCard> {
  const p = await proposalNow(v, a.key);
  const owner = a.ownerUserId ? await withTenant(getRuntime().db, v.tenantId, async (tx) => (await tx.execute(sql`select name from auth.user where id::text = ${a.ownerUserId!}`))[0]?.name as string | undefined) : undefined;
  const who = a.ownerUserId ? (a.ownerUserId === v.userId ? `you (${owner ?? "you"})` : owner ?? "an unknown person") : undefined;
  const lines = [
    ...(a.title !== undefined ? [{ label: "Title", value: `${(p?.title as string | undefined) ?? "–"} → ${a.title}` }] : []),
    ...(a.description !== undefined ? [{ label: "Description", value: a.description ?? "none" }] : []),
    ...(a.estimateHours !== undefined ? [{ label: "Estimate", value: a.estimateHours === null ? "none" : `${a.estimateHours} h` }] : []),
    ...(who ? [{ label: "Owner", value: `${(p?.owner_name as string | null) ?? "Unassigned"} → ${who}` }] : []),
  ];
  const only = who && lines.length === 1;
  // 081 AC-71: an owner change shows From and To, and who hears of it (never the person confirming).
  const told = a.ownerUserId && a.ownerUserId !== p?.owner_user_id
    ? [a.ownerUserId !== v.userId ? owner : null, p?.owner_user_id && p.owner_user_id !== v.userId ? (p.owner_name as string) : null].filter((x): x is string => !!x) : [];
  if (only) lines.splice(0, 1, { label: "From", value: (p?.owner_name as string | null) ?? "Unassigned" }, { label: "To", value: who! });
  if (told.length) lines.push({ label: "Told", value: `${told.join(" and ")} will be told` });
  return { title: only ? `Make ${owner ?? "them"} the owner of ${a.key}` : `Change ${a.key}`, lines,
    look: { kind: only ? "Change owner" : "Edit proposal", subject: p ? `${a.key} ${p.title as string}` : a.key, confirm: only ? "Change owner" : "Save", done: only ? `${owner ?? "They"} now own${owner ? "s" : ""} ${a.key}` : `Updated ${a.key}` } };
}
