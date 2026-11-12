// The only import surface for other modules (docs/module-standard.md). Reads apply the caller's
// tenant and data scope; events are what delivery emits through the outbox.
import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { withdrawnIn } from "./server/readiness";

export const PHASES = ["proposed", "planned", "building", "verified", "released"] as const;
export type Phase = (typeof PHASES)[number];

/** A release's page. A re-tag changes it, so tag_release returns the old and new page as `moved` (057). */
export const releaseHref = (r: { projectKey: string; version: string }) => `/delivery/releases/${r.projectKey}/${encodeURIComponent(r.version)}`;

export type ProjectRef = { id: string; key: string; name: string; client: string; managerUserId: string | null; legalEntityId: string | null };

/** Emitted when a deployment is recorded. `released` is true when the environment is Prod. */
export type ReleaseDeployed = { releaseId: string; projectId: string; version: string; environment: string; status: "deployed" | "testing" | "rolled-back"; released: boolean };
/** Emitted on every phase change, from a board move, a sync or a Prod deployment. */
/** 081: `ownerUserId` is the proposal's owner, told about changes others make (null when it has none). */
export type ProposalPhaseChanged = { proposalId: string; key: string; projectId: string; from: Phase; to: Phase; by: string; ownerUserId?: string | null };

/**
 * 081 amendment 6: a proposal's owner changed: `from` and `to` are user ids (null for none), `cleared` when it now has none. Raised
 * by create, update_proposal and a "Suggested owner" accept or undo; a sync only fills in the person it acts for.
 */
export type ProposalOwnerChanged = { proposalId: string; key: string; title: string; projectId: string; from: string | null; to: string | null; toName: string | null; cleared: boolean; by: string };

/** A proposal made by hand moved to the hand-made series because a spec change owns its old key. */
export type ProposalRekeyed = { proposalId: string; projectId: string; from: string; to: string };

/** 081: a proposal made by hand was withdrawn (never deleted). `by` is the actor, "… for user:…" when acting for someone. */
/** 081 amendment 7 (AC-74): `ownerUserId` (null for none) and `title`, so the owner can be told. */
export type ProposalWithdrawn = { proposalId: string; key: string; projectId: string; by: string; reason: string; ownerUserId?: string | null; title?: string };

export const EVENTS = { releaseDeployed: "delivery.release.deployed", proposalPhaseChanged: "delivery.proposal.phase_changed", proposalRekeyed: "delivery.proposal.rekeyed", proposalWithdrawn: "delivery.proposal.withdrawn", taskDone: "delivery.task.done", taskReopened: "delivery.task.reopened", commitTime: "delivery.commit.time", ownerChanged: "delivery.proposal.owner_changed" } as const;

/**
 * 081: a proposal's page. It shares the `proposals/:phase` segment: a phase name (lowercase) is the list, anything
 * else is a key (CON-014, AMX-H001). Keys are unique per tenant; a rekey moves the page, pins follow the id.
 */
export const proposalHref = (key: string) => `/delivery/proposals/${encodeURIComponent(key)}`;

/** 087 AC-3: the key a proposal page's segment names. A malformed escape ("%E0%A4%A") stays as written, so it reads as an unknown key. */
export const proposalKeyFrom = (segment: string) => { try { return decodeURIComponent(segment); } catch { return segment; } };

/** 081: one proposal for another module (Time names one on an entry). `withdrawn` covers both a hand withdrawal and a spec folder that went away. */
export type ProposalRef = { id: string; key: string; title: string; phase: Phase; projectId: string; projectKey: string; withdrawn: boolean };

/**
 * 081 AC-28, review round 1: the slot Time fills with a proposal's time lines (log, correction, removal), each one the
 * viewer may see by Time's own rule. Delivery formats them into the proposal's history; with Time switched off nothing
 * fills it, and the history has no time lines. `proposal.projectId` is the proposal's project.
 */
export const PROPOSAL_TIME_SLOT = "delivery.proposal-time";
export type ProposalTimeLine = {
  /** Stable for this line, unique among the proposal's history (Time uses "time:<audit seq>"); its pin names it. */
  id: string;
  at: string; actor: string; onBehalfOf: string | null; userId: string; day: string | null; hours: number;
  proposalId: string | null; previousProposalId?: string | null; deleted?: boolean;
};
/**
 * `opts.line` (review round 2): just that line ("time:<seq>"), read directly with no window, for its pin; a line that exists
 * but the viewer may not see is refused (ForbiddenError), never returned empty as if it were gone. 087 AC-9: `partial` when the
 * source stopped at its bound before it had read every line.
 */
export type ProposalTimeSource = (tx: Tx, viewer: Viewer, proposal: { id: string; projectId: string }, opts?: { line?: string }) => Promise<{ lines: ProposalTimeLine[]; partial: boolean }>;

/** 081 AC-4: Time's approved hours per proposal, a Delivery service Time runs under a job context (see the service). */
export { PROPOSAL_HOURS_JOB, setProposalHours } from "./server/proposal-hours";

export async function getProposalRef(tx: Tx, keyOrId: string): Promise<ProposalRef | null> {
  const [r] = await tx.execute(sql`select p.id, p.key, p.title, p.phase, p.project_id, pr.key as project_key,
      ${withdrawnIn("p")} as withdrawn
    from delivery.proposal p join delivery.project pr on pr.id = p.project_id where p.key = ${keyOrId} or p.id::text = ${keyOrId}`);
  return r ? { id: r.id as string, key: r.key as string, title: r.title as string, phase: r.phase as Phase, projectId: r.project_id as string, projectKey: r.project_key as string, withdrawn: Boolean(r.withdrawn) } : null;
}

/**
 * 008 AC-3: hours a person's commit says they spent, for the time module to draft on their timesheet as a
 * suggestion they accept. Never a logged entry, never a rating. `day` is the commit's date (UTC).
 */
export type CommitTime = { userId: string; projectId: string; projectKey: string; proposalKey: string; day: string; hours: number; commit: string };

/** 008: a proposal task was closed (by a commit, CI or a person). `by` is the actor, "… for user:…" when acting for someone. */
export type TaskDone = { proposalId: string; key: string; task: string; projectId: string; by: string; ownerUserId?: string | null };
/** 081 amendment 5: a task closed by mistake, opened again (a hand-made proposal's). */
export type TaskReopened = { proposalId: string; key: string; task: string; projectId: string; by: string };

const toRef = (r: Record<string, unknown>): ProjectRef => ({
  id: r.id as string, key: r.key as string, name: r.name as string, client: r.client as string,
  managerUserId: (r.manager_user_id as string | null) ?? null, legalEntityId: (r.legal_entity_id as string | null) ?? null,
});

/** Projects visible in this tenant transaction (time, finance and allocations look projects up here). */
export async function listProjectRefs(tx: Tx): Promise<ProjectRef[]> {
  return (await tx.execute(sql`select id, key, name, client, manager_user_id, legal_entity_id from delivery.project where status = 'active' order by name`)).map(toRef);
}

export async function getProjectRef(tx: Tx, keyOrId: string): Promise<ProjectRef | null> {
  const [r] = await tx.execute(sql`select id, key, name, client, manager_user_id, legal_entity_id from delivery.project where key = ${keyOrId} or id::text = ${keyOrId}`);
  return r ? toRef(r) : null;
}

/**
 * Project creation for other modules (presales' "Promote to delivery"). `sourceRef` names the record
 * the project comes from, e.g. "presales.opportunity:OPP0042": a second create with it and the same
 * key returns the project already made (`existing: true`) instead of a new one. Callers gate their UI
 * on PROJECT_CREATE_PERMISSION.
 */
export { createProject, PROJECT_CREATE_PERMISSION, type CreateProjectInput, type CreateProjectResult } from "./server/project-contract";
export { ProjectConflictError, type CreatedProject } from "./server/project-create";

/** Projects a user manages: feeds the viewer's @managed scope. */
export async function managedProjectIds(tx: Tx, userId: string): Promise<string[]> {
  return (await tx.execute(sql`select id from delivery.project where manager_user_id = ${userId}`)).map((r) => r.id as string);
}

/**
 * The project page's sections (051), in tab order. Allocations renders Team under the same header,
 * so the tabs live here as data: `path` "" is the Board.
 */
export const PROJECT_SECTIONS = [
  { path: "", label: "Board" },
  { path: "proposals", label: "Proposals" },
  { path: "releases", label: "Releases" },
  { path: "risks", label: "Risks and decisions" },
  { path: "team", label: "Team" },
  { path: "contract", label: "Contract" },
] as const;
export type ProjectSection = (typeof PROJECT_SECTIONS)[number]["path"];

export const projectHref = (key: string, section: ProjectSection = "") => `/delivery/p/${encodeURIComponent(key)}${section ? `/${section}` : ""}`;
