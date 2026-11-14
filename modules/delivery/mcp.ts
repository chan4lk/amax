import { z } from "zod";
import type { McpToolDef, SearchHit } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { PHASES, proposalHref } from "./contracts";
import { pinOf } from "./pins";
import { ctxFor } from "./server/context";
import { getActivity, listActivity } from "./server/activity";
import { markTaskDone, reopenTask, TaskInput } from "./server/tasks";
import { COMMIT_TIME_MANAGE, commitTimeSettings, setCommitTimeLogging } from "./server/commit-time";
import { syncProposal } from "./server/services";
import { getRepoSync, getSyncPush, linkProjectRepo } from "./server/repo-sync";
import { PushInput, pushSpecclaw } from "./server/push";
import { RepoUrl } from "./sync/repo-url";
import { proposalDetail, proposalEvent } from "./server/proposal-detail";
import { addProposalTask, updateProposal, withdrawProposal } from "./server/lifecycle";
import { createProposalCard, moveCard, proposeCreate, proposeUpdate, taskCard, updateCard } from "./server/proposal-card";
import { createReleaseCard, deploymentCard, environmentCard, linkCard, releaseProposalsCard, removeEnvironmentCard, tagCard, taskDoneCard, reopenCard, unlinkCard, voidCard, withdrawCard } from "./server/write-cards";
import { isNeed, NEEDS, withNeed } from "./server/attention";
import { checkReleaseRef, getDeployment, getProposalTask, getEnvironment, getProject, getRelease, proposalMetrics, isRelease, listEnvironments, likelyProposals, listProjects, listProposals, listReleases } from "./server/queries";
import { createProject, createProposal, ProposalCreateInput, createRelease, moveProposal, recordDeployment, removeEnvironment, setReleaseProposals, tagRelease, upsertEnvironment, voidDeployment } from "./server/services";
import { commitTime, repoTime } from "./server/repo-time";

// MCP tools (004): the same queries and services as the screens, so permissions and audit match.
// Chat (005) runs read tools directly and turns write tools into a confirm card first.
type Src = "mcp" | "chat";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: "delivery:read" };
// One input for every read that names a release: its id, or its project key and version (057).
const releaseRef = z.object({ releaseId: z.string().uuid().optional(), projectKey: z.string().optional(), version: z.string().optional() });
// 059: a pin names one record by its id; a list or a project's environments is a view.
const view = "view" as const;

export const mcpTools: McpToolDef[] = [
  // 084 AC-3: `mine` keeps the projects the viewer manages or is assigned to (their data scopes), for "which project?".
  tool({ ...read, pin: view, name: "list_projects", description: "Active projects with health, sprint progress and next release. mine: true keeps only the projects you manage or are assigned to. agentFirst: its proposals come from its linked repo, never by hand.",
    input: z.object({ mine: z.boolean().optional() }),
    run: async (v, a) => { const all = await listProjects(v); return a.mine ? all.filter((p) => v.managedProjects.includes(p.id) || v.assignedProjects.includes(p.id)) : all; } }),
  // 008 AC-4: the Overview's Agent activity feed, and one line of it for its pin.
  tool({ ...read, pin: view, name: "list_activity", description: "What agents, pipelines and people did lately through ingestion, newest first, with who acted for whom.",
    input: z.object({ limit: z.number().int().min(1).max(50).optional() }), run: (v, a) => listActivity(v, a.limit) }),
  tool({ ...read, pin: { id: "id", of: (r: { id: string; pin: { label: string } } | null) => (r ? { id: r.id, label: r.pin.label } : null) }, name: "get_activity", description: "One line of the agent activity feed by id.",
    input: z.object({ id: z.string().uuid() }), run: (v, a) => getActivity(v, a.id) }),
  tool({ ...read, pin: { id: "projectId", of: pinOf.project }, name: "get_project", description: "One project and its proposals, by projectId or by project key such as CON or AMX.",
    input: z.object({ projectId: z.string().uuid().optional(), key: z.string().optional() }), run: (v, a) => getProject(v, a.key, a.projectId) }),
  // 081 amendment 9 (AC-85): `mine` keeps your own proposals; `likelyForMe` (with a project key) lists that project's
  // open proposals, the likeliest for you first, each with why: what Log time offers as quick replies.
  tool({ ...read, pin: view, name: "list_proposals", description: "Proposals (specclaw and hand-made), newest change first, optionally filtered by phase, project key or text in the key or title (q). Without a project key, only active projects; withdrawn ones never. mine: true keeps the ones you own. need keeps open ones needing attention for one reason: suggested (amax suggests something you may decide), ready (Building, every task done), over (approved hours past the estimate) or unassigned (no owner). likelyForMe: true with a projectKey lists that project's open proposals (up to five), the likeliest for you first (yours and Building, yours, ones you closed a task on lately, then by phase), each with why.",
    input: z.object({ phase: z.enum(PHASES).optional(), projectKey: z.string().optional(), q: z.string().max(100).optional(), mine: z.boolean().optional(), likelyForMe: z.boolean().optional(), need: z.enum(NEEDS).optional() }),
    run: async (v, a) => {
      if (a.likelyForMe && !a.projectKey) throw new ToolError("likelyForMe needs a projectKey", "invalid_input");
      if (a.likelyForMe) return likelyProposals(v, a.projectKey!);
      const rows = await listProposals(v, { phase: a.phase, projectKey: a.projectKey, q: a.q, ownerUserId: a.mine ? v.userId : undefined });
      // 081 amendment 11 (AC-96): an attention tile's pin: only the proposals with that reason.
      return isNeed(a.need) ? withNeed(v, rows, a.need) : rows;
    } }),
  // 081 AC-17: the Proposals page's metric cards: counts by phase, released this month, and shipped to Prod per week.
  tool({ ...read, pin: view, name: "get_proposal_metrics", description: "Proposal counts by phase (in flight, and releasedThisMonth: released since the 1st of this calendar month, UTC, named in month) and proposals shipped to Prod per ISO week for the last 8 weeks, across active projects or for one project key.",
    input: z.object({ projectKey: z.string().optional() }), run: (v, a) => proposalMetrics(v, a) }),
  tool({ ...read, pin: { id: "proposalId", of: pinOf.proposal }, name: "get_proposal", description: "One proposal by proposalId, or by key such as CON-012 (a key given with an id only narrows): phase, owner, description, approved hours against the estimate and hours waiting for approval (waitingHours), tasks, its release and the environments it reached, and its history. A withdrawn proposal is still found, marked withdrawn.",
    input: z.object({ proposalId: z.string().uuid().optional(), key: z.string().optional() }), run: (v, a) => proposalDetail(v, a) }),
  // 081 amendment 11 (AC-99): one task, for its row's pin on the proposal page.
  tool({ ...read, pin: { id: "taskId", of: pinOf.task }, name: "get_proposal_task", description: "One task of a proposal by taskId: its ref (T3), title, whether it is done and when, and its proposal. A proposal key given with it only narrows.",
    input: z.object({ taskId: z.string().uuid(), key: z.string().optional() }), run: (v, a) => getProposalTask(v, a.taskId, { key: a.key }) }),
  // Review 081 round 1 (R3): one line of a proposal's history, for its row's pin on the proposal page.
  tool({ ...read, pin: { id: "proposalId", of: pinOf.event }, name: "get_proposal_event", description: "One line of a proposal's history by proposalId and line (as get_proposal's history gives it, such as audit:12 or task:<id>): what happened, who, and when. A time line shows only to its owner and the project's approvers.",
    input: z.object({ proposalId: z.string().uuid(), line: z.string().regex(/^(?:(audit|time|event|task):[0-9a-f-]+|repo:(proposal|tasks|verify|pr|archived))$/, "a history line id such as audit:12") }), run: (v, a) => proposalEvent(v, a) }),
  tool({ ...read, pin: view, name: "list_releases", description: "Every release with its project, proposal count and the stage it reached in each environment, optionally for one project key.",
    input: z.object({ projectKey: z.string().optional() }), run: (v, a) => listReleases(v, a) }),
  tool({ ...read, pin: { id: "releaseId", of: pinOf.release }, name: "get_release", description: "A release and where it is in Dev, QA, UAT and Prod: by releaseId, or by project key and version.",
    // The ref is checked before the read, so a malformed call is refused whatever the viewer can see.
    input: releaseRef, run: async (v, a) => { checkReleaseRef(a); return (await listReleases(v)).find((r) => isRelease(r, a)) ?? null; } }),
  tool({ name: "create_project", description: "Create a project. Key: 2-10 capitals, e.g. CON.", scope: "write", permission: "delivery:project:create",
    input: z.object({ key: z.string(), name: z.string(), client: z.string(), billing: z.enum(["fixed", "t&m", "retainer", "internal"]) }),
    service: createProject, run: (v, a, s = "mcp") => createProject(ctxFor(v, s), a) }),
  tool({ name: "create_proposal", description: "Add a proposal made by hand to a project's board (it starts as Proposed). The owner is you, or the person you act for, unless ownerUserId names someone on the project. In chat, when no project is pinned or named, ask which one first: call list_projects with mine true. Leave out every project with agentFirst true (its proposals come from its repo; this tool refuses them), in every list below. Two or more: offer_answers with \"Which project is it for?\" and up to six answers \"<KEY> · <Name>\" (the project key, e.g. \"CON · Contoso Portal\"). Exactly one: offer_answers with that one and \"Another project\". None, or the user picks Another project: call list_projects without mine and offer up to six of the active projects they may add proposals to (not one already offered). Never pick the project for them. Then, before proposing it, settle the owner unless the user already named one or said me: call get_project_team for the project, then offer_choices with the question \"Who owns it?\": first \"Me\" (this input without ownerUserId), then up to three teammates on the project this month (their first percent above 0) who have a userId and aren't the user, most allocated first, each labelled \"<name> · <role> · <freeThisMonth>% free this month\" (\"fully allocated\" at 0, \"over-allocated by <n>%\" below it) with ownerUserId their userId. Only when you can't read the team, or nobody else is on it, propose it with the user as owner.", scope: "write", permission: "delivery:proposal:create",
    input: ProposalCreateInput, propose: proposeCreate, card: createProposalCard,
    service: createProposal, run: (v, a, s = "mcp") => createProposal(ctxFor(v, s), a) }),
  // 081 AC-9 to AC-11: a hand-made proposal's lifecycle. A spec proposal changes in its repo; only its owner is set here.
  tool({ name: "update_proposal", description: "Edit a proposal made by hand that isn't released or withdrawn: its title, description, estimate (null clears it) or owner (an active person's ownerUserId). A spec proposal's content comes from its repo; only its owner can be changed here.", scope: "write",
    permission: "delivery:proposal:create", input: z.object({ key: z.string(), title: z.string().optional(), description: z.string().nullable().optional(), estimateHours: z.number().nonnegative().nullable().optional(), ownerUserId: z.string().uuid().optional() }),
    propose: proposeUpdate, card: updateCard, service: updateProposal, run: (v, a, s = "mcp") => updateProposal(ctxFor(v, s), a) }),
  tool({ name: "withdraw_proposal", description: "Withdraw a proposal made by hand that isn't released, with a reason. Nothing is deleted: it leaves lists, counts, the board and its release, and its page and history stay. A spec proposal is withdrawn by removing it from its repo.", scope: "write", destructive: true,
    permission: "delivery:proposal:move", input: z.object({ key: z.string(), reason: z.string() }), card: withdrawCard, service: withdrawProposal, run: (v, a, s = "mcp") => withdrawProposal(ctxFor(v, s), a) }),
  tool({ name: "add_proposal_task", description: "Add the next task (T1, T2, …) to a proposal made by hand that isn't released or withdrawn. Close it later with mark_task_done.", scope: "write",
    permission: "delivery:task:done", input: z.object({ key: z.string(), title: z.string() }), card: taskCard, service: addProposalTask, run: (v, a, s = "mcp") => addProposalTask(ctxFor(v, s), a) }),
  tool({ name: "move_proposal", description: "Move a proposal on the board (proposed, planned, building, verified). Released only comes from a Prod deployment.", scope: "write",
    permission: "delivery:proposal:move", input: z.object({ key: z.string(), to: z.enum(["proposed", "planned", "building", "verified"]) }),
    card: moveCard, service: moveProposal, run: (v, a, s = "mcp") => moveProposal(ctxFor(v, s), a) }),
  tool({ name: "create_release", description: "Create a release (version tag) for a project, optionally with proposal keys.", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), version: z.string(), proposalKeys: z.array(z.string()).optional() }),
    card: createReleaseCard, service: createRelease, run: (v, a, s = "mcp") => createRelease(ctxFor(v, s), { ...a, proposalKeys: a.proposalKeys ?? [] }) }),
  tool({ ...read, pin: view, name: "list_environments", description: "A project's environments in order, which one is Prod, and how many deployments each has.", input: z.object({ projectKey: z.string() }),
    run: (v, a) => listEnvironments(v, a.projectKey) }),
  tool({ ...read, pin: { id: "environmentId", of: pinOf.environment }, name: "get_environment", description: "One environment, by environmentId or by project key and name: its position, whether it is Prod, and how many deployments it has.",
    input: z.object({ environmentId: z.string().uuid().optional(), projectKey: z.string().optional(), name: z.string().optional() }), run: (v, a) => getEnvironment(v, a) }),
  tool({ ...read, pin: { id: "deploymentId", of: pinOf.deployment }, name: "get_deployment", description: "One deployment by id (a row of a release's deployment history), including a voided one. A project key or version only narrows.",
    input: z.object({ deploymentId: z.string().uuid(), projectKey: z.string().optional(), version: z.string().optional() }), run: (v, a) => getDeployment(v, a.deploymentId, a) }),
  tool({ ...read, pin: { id: "releaseId", of: pinOf.history }, name: "get_release_history", description: "A release's proposals and full deployment history, including voided records: by releaseId, or by project key and version.",
    input: releaseRef, run: (v, a) => getRelease(v, a.projectKey, a.version, a.releaseId) }),
  tool({ name: "upsert_environment", description: "Add, rename, reorder or mark an environment as Prod for a project (marking one Prod unmarks the rest).", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), name: z.string(), rename: z.string().optional(), position: z.number().int().min(1).optional(), isProd: z.boolean().optional() }),
    card: environmentCard, service: upsertEnvironment, run: (v, a, s = "mcp") => upsertEnvironment(ctxFor(v, s), a) }),
  tool({ name: "remove_environment", description: "Remove an unused environment from a project.", scope: "write", destructive: true, permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), name: z.string() }), card: removeEnvironmentCard, service: removeEnvironment, run: (v, a, s = "mcp") => removeEnvironment(ctxFor(v, s), a) }),
  tool({ name: "tag_release", description: "Rename a release's version tag, e.g. v2.5.0 to v2.5.1.", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), version: z.string(), newVersion: z.string() }), card: tagCard, service: tagRelease, run: (v, a, s = "mcp") => tagRelease(ctxFor(v, s), a) }),
  tool({ name: "set_release_proposals", description: "Set which proposals are in a release (replaces the list; released ones stay).", scope: "write", permission: "delivery:release:create",
    input: z.object({ projectKey: z.string(), version: z.string(), proposalKeys: z.array(z.string()) }), card: releaseProposalsCard, service: setReleaseProposals, run: (v, a, s = "mcp") => setReleaseProposals(ctxFor(v, s), a) }),
  tool({ name: "void_deployment", description: "Void a deployment of a release, with a reason: the one given by deploymentId, or else the latest live one to the environment. Voiding the only Prod deployment un-releases its proposals.", scope: "write", destructive: true,
    permission: "delivery:deployment:record", input: z.object({ projectKey: z.string(), version: z.string(), environment: z.string(), deploymentId: z.string().uuid().optional(), reason: z.string() }),
    card: voidCard, service: voidDeployment, run: (v, a, s = "mcp") => voidDeployment(ctxFor(v, s), a) }),
  // 008 AC-1: what specclaw and CI call, as a person or as a service credential acting for one.
  tool({ name: "sync_proposal", description: "Create or update a specclaw proposal from its spec: title, phase, and tasks by id (T1, T2, …), with the commit time the spec was read at (committedAt). A task once done stays done.", scope: "write", permission: "delivery:proposal:sync",
    input: z.object({ projectKey: z.string(), projectName: z.string(), client: z.string(), key: z.string(), title: z.string(), phase: z.enum(PHASES), sourceRef: z.string(), tasks: z.array(TaskInput), meta: z.record(z.string(), z.unknown()).optional(), committedAt: commitTime,
      createdAt: repoTime.describe("When the spec says the change was written (its Created header, state.json or the commit that added it); leave it out when unknown"),
      ownerEmail: z.string().max(320).nullable().optional().describe("Who the spec names as owner (its Owner line, else its author); null names nobody, leave it out when unknown so the owner stays") }),
    service: syncProposal, run: (v, a, s = "mcp") => syncProposal(ctxFor(v, s), { projectKey: a.projectKey, project: { name: a.projectName, client: a.client }, key: a.key, title: a.title, phase: a.phase,
      tasksDone: a.tasks.filter((t) => t.done).length, tasksTotal: a.tasks.length, source: "specclaw", sourceRef: a.sourceRef, releasedAt: null, meta: a.meta ?? {}, tasks: a.tasks, committedAt: a.committedAt, ownerEmail: a.ownerEmail, createdAt: a.createdAt }) }),
  // 062: the amax plugin's push of a whole repo's specclaw state. Many keyed writes, so never a chat
  // confirm card (service: null); the plugin previews with dryRun and the developer confirms there.
  tool({ name: "sync_specclaw", description: "Push a repo's specclaw changes to its linked project. dryRun (the default) previews created, updated, unchanged and skipped; dryRun false applies. Refused when the repo isn't the project's linked repo or you're not on the project. Per proposal it never moves one to Released (a finished change the default branch brings that amax never stored comes in as Released history), and skips a step back a phase, and anything older than the commit it was last synced from. Two change folders sharing a number are both skipped for a person to fix. A branch can't take over a key the default branch holds for another folder. withdrawMissing (default false; only when one push from the default branch carries every change) withdraws a proposal whose folder is gone, if that branch last synced it, no newer commit has and it isn't Released; one that would withdraw more than half of them is held until confirmWithdraw names the held count. Never creates a project.",
    scope: "write", permission: "delivery:proposal:push", input: PushInput, service: null, run: (v, a, s = "mcp") => pushSpecclaw(v, a, s) }),
  tool({ ...read, pin: { id: "projectId", of: pinOf.repoSync }, name: "get_repo_sync", description: "A project's linked repo and its recent specclaw pushes (applied and refused, with who and why), by projectId or project key.",
    input: z.object({ projectId: z.string().uuid().optional(), projectKey: z.string().optional() }), run: (v, a) => getRepoSync(v, a) }),
  tool({ ...read, pin: { id: "pushId", of: pinOf.push }, name: "get_sync_push", description: "One specclaw push to a project by pushId: who, branch and commit, counts, and what was skipped or why it was refused.",
    input: z.object({ pushId: z.string().uuid() }), run: (v, a) => getSyncPush(v, a.pushId) }),
  tool({ name: "link_project_repo", description: "Link the one repo a project's specclaw proposals sync from, e.g. https://github.com/example/portal, and its default branch (asked the first time; kept on a relink unless given). Pushes from any other repo are refused; only the default branch's pushes may update every change. PM or Admin.", scope: "write",
    permission: "delivery:project:link", input: z.object({ projectKey: z.string(), repoUrl: RepoUrl, defaultBranch: z.string().min(1).max(200).optional() }), card: linkCard, service: linkProjectRepo, run: (v, a, s = "mcp") => linkProjectRepo(ctxFor(v, s), a) }),
  tool({ name: "unlink_project_repo", description: "Unlink a project's repo, so no specclaw push is accepted until one is linked again. PM or Admin.", scope: "write", destructive: true,
    permission: "delivery:project:link", input: z.object({ projectKey: z.string() }), card: unlinkCard, service: linkProjectRepo, run: (v, a, s = "mcp") => linkProjectRepo(ctxFor(v, s), { projectKey: a.projectKey, repoUrl: null }) }),
  tool({ name: "mark_task_done", description: "Mark one task of a proposal done by its id, e.g. CON-014 T3, optionally naming the commit that finished it.", scope: "write", permission: "delivery:task:done",
    input: z.object({ key: z.string(), task: z.string(), commit: z.string().optional() }), card: taskDoneCard, service: markTaskDone, run: (v, a, s = "mcp") => markTaskDone(ctxFor(v, s), a) }),
  // 081 amendment 5 (AC-59): the undo for a task closed by mistake.
  tool({ name: "reopen_task", description: "Open again a task closed by mistake, e.g. CON-018 T1, on a proposal made by hand that isn't released or withdrawn. A spec proposal's tasks follow its repo. The proposal doesn't move back a phase.", scope: "write", permission: "delivery:task:done",
    input: z.object({ key: z.string(), task: z.string() }), card: reopenCard, service: reopenTask, run: (v, a, s = "mcp") => reopenTask(ctxFor(v, s), a) }),
  // 008 AC-6: drafting timesheets from commits, per legal entity, Admin only.
  tool({ ...read, permission: COMMIT_TIME_MANAGE, pin: view, name: "get_commit_time_logging", description: "Which legal entities draft timesheet hours from commits, and when their people were told.", input: z.object({}), run: (v) => commitTimeSettings(v) }),
  tool({ name: "set_commit_time_logging", description: "Switch drafting timesheet hours from commits on or off for a legal entity. Switching it on needs peopleNotified: true, after the entity's people were told. Commit data only drafts timesheets, never ratings.", scope: "write", permission: COMMIT_TIME_MANAGE,
    input: z.object({ legalEntityId: z.string().uuid(), enabled: z.boolean(), peopleNotified: z.boolean().optional() }), service: setCommitTimeLogging, run: (v, a, s = "mcp") => setCommitTimeLogging(ctxFor(v, s), a) }),
  tool({ name: "record_deployment", description: "Record that a release reached any environment of its project (by name, as a pipeline reports it). The project's Prod environment releases its proposals. PM or Admin.", scope: "write", destructive: false,
    permission: "delivery:deployment:record",
    input: z.object({ projectKey: z.string(), version: z.string(), environment: z.string(), status: z.enum(["deployed", "testing", "rolled-back"]).optional(), note: z.string().optional() }),
    card: deploymentCard, service: recordDeployment, run: (v, a, s = "mcp") => recordDeployment(ctxFor(v, s), a) }),
];

// Contribution to the built-in search tool.
export async function search(viewer: Viewer, query: string): Promise<SearchHit[]> {
  const q = query.toLowerCase();
  const [projects, proposals] = await Promise.all([listProjects(viewer), listProposals(viewer)]);
  return [
    ...projects.filter((p) => `${p.key} ${p.name} ${p.client}`.toLowerCase().includes(q)).map((p) => ({ type: "project", id: p.key, title: p.name, url: `/delivery/p/${p.key}`, summary: `${p.client}, ${p.health}` })),
    ...proposals.filter((p) => `${p.key} ${p.title}`.toLowerCase().includes(q)).map((p) => ({ type: "proposal", id: p.key, title: `${p.key} ${p.title}`, url: proposalHref(p.key), summary: `${p.phase} in ${p.projectName}` })),
  ].slice(0, 20);
}
