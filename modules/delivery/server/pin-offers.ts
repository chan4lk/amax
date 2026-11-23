import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, canEver, type Viewer } from "@amax/auth";
import { getRuntime, hasModule } from "@amax/core/server";
import { getDeployment, getEnvironment, getProposal, getProposalTask, listReleases, manualProjects, type ProposalRow } from "./queries";
import { agentFirstSql } from "./agent-first";
import { hasNoOwner } from "./readiness";
import { liveProdDeployments } from "./in-prod";

// 081 amendments 2 and 3 (AC-30, AC-38): what a pinned Delivery record offers in chat. Each offer is the prompt its
// tool's chat flow takes; a click fills the box, the write waits for the confirm card. Read when chat asks, so the
// record as it is now decides, and only what the viewer may do on the record's project is offered, three at most.
export type Offer = { label: string; prompt: string; tool: string };
type Gated = Offer & { permission: string };
type Args = Record<string, unknown>;
const MAX = 3;
const str = (x: unknown) => (typeof x === "string" && x ? x : undefined);
const label = (p: string) => p[0].toUpperCase() + p.slice(1);
const NEXT: Record<string, string> = { proposed: "planned", planned: "building" };

const read = <T>(v: Viewer, fn: (tx: Tx) => Promise<T>) => withTenant(getRuntime().db, v.tenantId, fn);
const allowed = (v: Viewer, offers: Gated[], projectId: string | null) =>
  offers.filter((o) => (projectId ? can(v, o.permission, { projectId }) : canEver(v, o.permission))).slice(0, MAX).map(({ label: l, prompt, tool }) => ({ label: l, prompt, tool }));

/** 087 AC-5: a task closed within a day may be reopened (AC-59's window), on the database clock, for every pin that offers it. */
const justClosed = sql`t.done and t.done_at > now() - interval '1 day'`;

/** The next minor after a project's newest release (v2.5.0 → v2.6.0); v1.0.0 for its first. */
export function nextVersion(latest: string | null) {
  const m = latest?.match(/^v?(\d+)\.(\d+)\.\d+$/);
  return m ? `v${m[1]}.${Number(m[2]) + 1}.0` : "v1.0.0";
}

async function projectFacts(tx: Tx, where: ReturnType<typeof sql>) {
  const [p] = await tx.execute(sql`select p.id, p.key, p.name, p.status, p.repo_url, ${agentFirstSql(sql`p`)} as agent_first,
      (select r.version from delivery.release r where r.project_id = p.id order by r.created_at desc limit 1) as latest
    from delivery.project p where ${where}`);
  return p;
}

// 093 AC-4: never on an agent-first project, whose proposals come from its repo.
const newProposals = (p: Record<string, unknown>): Gated[] => (p.agent_first ? [] : [newProposal(p)]);
const newProposal = (p: Record<string, unknown>): Gated => ({ label: `New proposal in ${p.name as string}`, prompt: `Add a proposal to ${p.name as string} (${p.key as string}): `, tool: "create_proposal", permission: "delivery:proposal:create" });
const newRelease = (p: Record<string, unknown>): Gated => {
  const version = nextVersion((p.latest as string | null) ?? null);
  return { label: `Create release ${version} of ${p.key as string}`, prompt: `Create release ${version} of ${p.key as string}`, tool: "create_release", permission: "delivery:release:create" };
};
const link = (key: string, again: boolean): Gated => ({ label: `${again ? "Relink" : "Link"} ${key}'s repo`, prompt: `Link ${key}'s repo to `, tool: "link_project_repo", permission: "delivery:project:link" });

/** A project: a new proposal, its next release, its repo when none is linked. A closed project offers nothing. */
export async function projectOffers(v: Viewer, a: Args) {
  const id = str(a.projectId), key = str(a.key);
  if (!id && !key || !can(v, "delivery:read")) return [];
  const p = await read(v, (tx) => projectFacts(tx, id ? sql`p.id::text = ${id}` : sql`p.key = ${key!}`));
  if (!p || p.status !== "active") return [];
  return allowed(v, [...newProposals(p), newRelease(p), ...(p.repo_url ? [] : [link(p.key as string, false)])], p.id as string);
}

/** A project's repo sync: link it, or relink and unlink it. */
export async function repoOffers(v: Viewer, a: Args) {
  const id = str(a.projectId), key = str(a.projectKey);
  if (!id && !key || !can(v, "delivery:read")) return [];
  const p = await read(v, (tx) => projectFacts(tx, id ? sql`p.id::text = ${id}` : sql`p.key = ${key!}`));
  if (!p) return [];
  const k = p.key as string;
  const unlink: Gated = { label: `Unlink ${k}'s repo`, prompt: `Unlink ${k}'s repo`, tool: "unlink_project_repo", permission: "delivery:project:link" };
  return allowed(v, p.repo_url ? [link(k, true), unlink] : [link(k, false)], p.id as string);
}

/** A proposal: its next phase (Verified once every task is done), its next open task, a first task, an owner, a release. */
export async function proposalOffers(v: Viewer, a: Args) {
  const proposalId = str(a.proposalId), key = str(a.key);
  if (!proposalId && !key) return [];
  const p = await getProposal(v, { proposalId, key });
  if (!p || p.withdrawn || p.phase === "released") return [];
  const facts = await read(v, async (tx) => {
    const [x] = await tx.execute(sql`select pr.id as project_id,
        (select t.ref from delivery.task t where t.proposal_id = p.id and not t.done order by length(t.ref), t.ref limit 1) as open_task,
        (select t.ref from delivery.task t where t.proposal_id = p.id and ${justClosed} order by t.done_at desc limit 1) as just_closed,
        to_regclass('time.entry') is not null as time_tables
      from delivery.proposal p join delivery.project pr on pr.id = p.project_id where p.id = ${p.id}`);
    // The newest release of the project not yet live in Prod: where a verified proposal with no release goes.
    const [r] = p.phase === "verified" && !p.release ? await tx.execute(sql`select r.version, coalesce((select string_agg(q.key, ', ' order by q.key) from delivery.proposal q where q.release_id = r.id), '') as keys
      from delivery.release r join delivery.project pr on pr.id = r.project_id where pr.key = ${p.projectKey}
        and not exists (${liveProdDeployments(sql`r.id`)})
      order by r.created_at desc limit 1`) : [];
    const [inRelease] = p.phase === "verified" && p.release ? await tx.execute(sql`select release_id from delivery.proposal where id = ${p.id}`) : [];
    return { projectId: x.project_id as string, openTask: (x.open_task as string | null) ?? null, justClosed: (x.just_closed as string | null) ?? null, release: r ? { version: r.version as string, keys: r.keys as string } : null,
      releaseId: (inRelease?.release_id as string | null) ?? null, timeTables: Boolean(x.time_tables) };
  });
  // 081 amendment 4 (AC-30 revised): Verified moves to Released only when its release reaches Prod, so a verified
  // proposal in a release that isn't live offers that release's next deployment, first.
  const deploy = facts.releaseId ? (await releaseOffers(v, { releaseId: facts.releaseId })).filter((o) => o.tool === "record_deployment") : [];
  const offers = [...deploy, ...allowed(v, proposalGated(p, v.userId, facts), facts.projectId)];
  // 081 amendment 9 (AC-86): log your own time against it. Time's permission is on your own entries, not the project, so
  // it's checked here; it comes second while the work is under way (Planned or Building), last otherwise.
  // 087 AC-6: only when Time is installed; with it switched off, log_time doesn't exist.
  const log = hasModule("time", facts.timeTables) && can(v, "time:log", { ownerUserId: v.userId }) ? [{ label: `Log time on ${p.key}`, prompt: `Log time on ${p.key} (${p.projectName}): `, tool: "log_time" }] : [];
  const busy = p.phase === "planned" || p.phase === "building";
  return (busy ? [...offers.slice(0, 1), ...log, ...offers.slice(1)] : [...offers, ...log]).slice(0, MAX);
}

function proposalGated(p: ProposalRow, me: string, f: { openTask: string | null; justClosed?: string | null; release: { version: string; keys: string } | null }): Gated[] {
  const owner: Gated[] = !hasNoOwner(p) ? [] : [{ label: `Make me the owner of ${p.key}`, prompt: `Make me (user id ${me}) the owner of ${p.key}`, tool: "update_proposal", permission: "delivery:proposal:create" }];
  const task: Gated[] = f.openTask ? [{ label: `Mark ${f.openTask} of ${p.key} done`, prompt: `Mark ${f.openTask} of ${p.key} done`, tool: "mark_task_done", permission: "delivery:task:done" }] : [];
  const release: Gated[] = f.release ? [{ label: `Put ${p.key} in ${p.projectKey} ${f.release.version}`, prompt: `Set the proposals in ${p.projectKey} ${f.release.version} to: ${[f.release.keys, p.key].filter(Boolean).join(", ")}`,
    tool: "set_release_proposals", permission: "delivery:release:create" }] : [];
  if (p.source !== null) return [...task, ...owner, ...release];
  // 081 amendment 4 (AC-30 revised): Building always offers Verified; while tasks are open the label says how many, and
  // the person decides (the agent's Ready to verify still nudges once they're all done).
  const open = Math.max(0, p.tasksTotal - p.tasksDone);
  const to = p.phase === "building" ? "verified" : NEXT[p.phase];
  const note = to === "verified" && open ? ` (${open} ${open === 1 ? "task" : "tasks"} open)` : "";
  const move: Gated[] = to ? [{ label: `Move ${p.key} to ${label(to)}${note}`, prompt: `Move ${p.key} to ${to}`, tool: "move_proposal", permission: "delivery:proposal:move" }] : [];
  const first: Gated[] = p.tasksTotal === 0 ? [{ label: `Add a task to ${p.key}`, prompt: `Add a task to ${p.key}: `, tool: "add_proposal_task", permission: "delivery:task:done" }] : [];
  // 081 amendment 4 (AC-46): the page's header no longer has an Edit button, so the pin offers it.
  const edit: Gated[] = [{ label: `Edit ${p.key}`, prompt: `Change ${p.key}: `, tool: "update_proposal", permission: "delivery:proposal:create" }];
  // Building with a task still open: closing it is the next step, so it comes first and the early move second (found in
  // the client's demo: the move, listed first, was easy to pick by mistake).
  // 081 amendment 5 (AC-59): a task closed in the last day can be reopened, in case it was closed by mistake.
  const reopen: Gated[] = f.justClosed ? [{ label: `Reopen ${f.justClosed} of ${p.key}`, prompt: `Reopen ${f.justClosed} of ${p.key}`, tool: "reopen_task", permission: "delivery:task:done" }] : [];
  // An unowned proposal's "Make me the owner" outranks Edit and Reopen (three suggestions at most).
  // Verified and in no release: putting it in the open release is the PM's next step, so it comes first (found in the
  // role run: last of three, "Make me the owner" could push it out).
  if (p.phase === "verified" && release.length) return [...release, ...owner, ...reopen, ...edit, ...task, ...first];
  if (p.phase === "building" && task.length) return [...task, ...move, ...owner, ...reopen, ...edit, ...first, ...release];
  return [...move, ...task, ...owner, ...reopen, ...edit, ...first, ...release];
}

/** A release: its next environment, its proposals, its tag. One live in Prod has nothing left to deploy or change. */
export async function releaseOffers(v: Viewer, a: Args) {
  const releaseId = str(a.releaseId);
  if (!releaseId || !can(v, "delivery:read")) return [];
  const [hit] = await read(v, (tx) => tx.execute(sql`select p.key from delivery.release r join delivery.project p on p.id = r.project_id where r.id::text = ${releaseId}`));
  const r = hit ? (await listReleases(v, { projectKey: hit.key as string })).find((x) => x.id === releaseId) : undefined;
  if (!r) return [];
  const name = `${r.projectKey} ${r.version}`;
  const stages = [...r.stages].sort((x, y) => x.position - y.position);
  const live = stages.some((s) => s.isProd && s.status === "deployed");
  // Reached: deployed or testing there. A rolled-back environment isn't, so its retry is what comes next.
  const reached = stages.reduce((at, s, i) => (s.status === "deployed" || s.status === "testing" ? i : at), -1);
  // Prod still testing is finished in place (the table's "Finish Prod"), so its deployment is what comes next.
  const next = live ? undefined : stages[reached]?.isProd && stages[reached].status === "testing" ? stages[reached] : stages[reached + 1];
  const keys = await read(v, async (tx) => (await tx.execute(sql`select string_agg(key, ', ' order by key) as keys from delivery.proposal where release_id = ${r.id}`))[0]?.keys as string | null);
  return allowed(v, [
    ...(next ? [{ label: `Record a deployment of ${name} to ${next.environment}`, prompt: `Record a deployment of ${name} to ${next.environment}`, tool: "record_deployment", permission: "delivery:deployment:record" }] : []),
    ...(live ? [] : [{ label: `Change the proposals in ${name}`, prompt: `Set the proposals in ${name} to: ${keys ?? ""}`, tool: "set_release_proposals", permission: "delivery:release:create" }]),
    { label: `Re-tag ${name}`, prompt: `Tag ${name} as `, tool: "tag_release", permission: "delivery:release:create" },
  ], r.projectId);
}

/** An environment: make it Prod, rename it, remove it while it has no deployments. */
export async function environmentOffers(v: Viewer, a: Args) {
  const environmentId = str(a.environmentId);
  if (!environmentId) return [];
  const e = await getEnvironment(v, { environmentId });
  if (!e) return [];
  const [p] = await read(v, (tx) => tx.execute(sql`select id from delivery.project where key = ${e.projectKey}`));
  const of = `the ${e.name} environment of ${e.projectKey}`;
  // 081 amendment 5 (AC-60): the row's buttons moved here. Prod (make or unmark) and Rename first; the third is Remove
  // while nothing was deployed there, else Move (three suggestions at most).
  const prod = e.isProd
    ? { label: `Unmark ${e.name} as the Prod environment of ${e.projectKey}`, prompt: `Unmark ${e.name} as the prod environment of ${e.projectKey}`, tool: "upsert_environment", permission: "delivery:release:create" }
    : { label: `Make ${e.name} the Prod environment of ${e.projectKey}`, prompt: `Make ${e.name} the prod environment of ${e.projectKey}`, tool: "upsert_environment", permission: "delivery:release:create" };
  const third = e.deployments === 0
    ? { label: `Remove ${of}`, prompt: `Remove ${of}`, tool: "remove_environment", permission: "delivery:release:create" }
    : { label: `Move ${of} to another position`, prompt: `Move ${of} to position `, tool: "upsert_environment", permission: "delivery:release:create" };
  return allowed(v, [prod, { label: `Rename ${of}`, prompt: `Rename ${of} to `, tool: "upsert_environment", permission: "delivery:release:create" }, third],
    (p?.id as string | undefined) ?? null);
}

/** A deployment: void it while it is live (the reason is typed on). */
export async function deploymentOffers(v: Viewer, a: Args) {
  const deploymentId = str(a.deploymentId);
  if (!deploymentId) return [];
  const d = await getDeployment(v, deploymentId);
  if (!d || d.voidedAt) return [];
  const [p] = await read(v, (tx) => tx.execute(sql`select id from delivery.project where key = ${d.projectKey}`));
  return allowed(v, [{ label: `Void the ${d.environment} deployment of ${d.projectKey} ${d.version}`, prompt: `Void the ${d.environment} deployment of ${d.projectKey} ${d.version} (id ${d.id}). Reason: `,
    tool: "void_deployment", permission: "delivery:deployment:record" }], (p?.id as string | undefined) ?? null);
}

/** 081 amendment 11 (AC-99): a task: close it while open, or reopen it within a day of closing (AC-59's window). */
export async function taskOffers(v: Viewer, a: Args) {
  const taskId = str(a.taskId);
  if (!taskId || !can(v, "delivery:read")) return [];
  const t = await getProposalTask(v, taskId);
  if (!t || t.withdrawn || t.phase === "released") return [];
  const name = `${t.ref} of ${t.proposalKey}`;
  if (!t.done) return allowed(v, [{ label: `Mark ${name} done`, prompt: `Mark ${name} done`, tool: "mark_task_done", permission: "delivery:task:done" }], t.projectId);
  const [r] = await read(v, (tx) => tx.execute(sql`select ${justClosed} as recent from delivery.task t where t.id = ${taskId}`));
  const recent = Boolean(r?.recent);
  return recent ? allowed(v, [{ label: `Reopen ${name}`, prompt: `Reopen ${name}`, tool: "reopen_task", permission: "delivery:task:done" }], t.projectId) : [];
}

/** The lists: a new record in the named project, or anywhere the viewer may make one. */
export async function viewOffers(v: Viewer, a: Args, kind: "proposals" | "releases" | "environments" | "projects") {
  if (kind === "projects") return allowed(v, [{ label: "New project", prompt: "Create a project: ", tool: "create_project", permission: "delivery:project:create" }], null);
  const key = str(a.projectKey);
  if (!key) return kind === "proposals" && (await manualProjects(v)).length ? allowed(v, [{ label: "New proposal", prompt: "Add a proposal to ", tool: "create_proposal", permission: "delivery:proposal:create" }], null) : [];
  if (!can(v, "delivery:read")) return [];
  const p = await read(v, (tx) => projectFacts(tx, sql`p.key = ${key}`));
  if (!p || p.status !== "active") return [];
  const offers = kind === "proposals" ? newProposals(p) : kind === "releases" ? [newRelease(p)]
    : [{ label: `Add an environment to ${key}`, prompt: `Add an environment to ${key}: `, tool: "upsert_environment", permission: "delivery:release:create" }];
  return allowed(v, offers, p.id as string);
}
