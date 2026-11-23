import { sql } from "drizzle-orm";
import { agentFirstSql } from "./agent-first";
import { BY_AGENT, BY_PERSON } from "./closed-by";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime } from "@amax/core/server";
import type { Phase } from "../contracts";
import { invalid } from "./refusal";
import { isWithdrawn, ownerShownIn, withdrawnIn } from "./readiness";
import { proposalInProd } from "./in-prod";

const read = async <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};
const isoDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
// When a row was made (059), so a pin saved under a name before a rename can't land on a newer row
// that took the name. Null for an environment or proposal made before migration 0012.
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export type ProjectRow = {
  id: string; key: string; name: string; client: string; billing: string; managerName: string | null; color: string;
  sprint: string | null; sprintDone: number; sprintTotal: number; health: string; riskPct: number | null;
  marginPct: number | null; contractValue: number | null; invoiced: number | null; nextRelease: string | null;
  sprintStart: string | null; sprintEnd: string | null;
  /** 093: the linked repo, and whether it's agent-first (the repo has brought in proposals; no manual creation). */
  repoUrl: string | null; agentFirst: boolean;
};

const project = (r: Record<string, unknown>): ProjectRow => ({
  id: r.id as string, key: r.key as string, name: r.name as string, client: r.client as string, billing: r.billing as string,
  managerName: (r.manager_name as string | null) ?? null, color: r.color as string, sprint: (r.sprint as string | null) ?? null,
  sprintDone: Number(r.sprint_done), sprintTotal: Number(r.sprint_total), health: r.health as string, riskPct: num(r.risk_pct),
  marginPct: num(r.margin_pct), contractValue: num(r.contract_value), invoiced: num(r.invoiced), nextRelease: (r.next_release as string | null) ?? null,
  sprintStart: isoDate(r.sprint_start), sprintEnd: isoDate(r.sprint_end),
  repoUrl: (r.repo_url as string | null) ?? null, agentFirst: r.agent_first === true,
});

export const listProjects = (v: Viewer, status: "active" | "closed" = "active") =>
  read(v, async (tx) => (await tx.execute(sql`select *, ${agentFirstSql(sql`delivery.project`)} as agent_first from delivery.project where status = ${status} order by created_at, name`)).map(project));

/** 093 AC-2: the active projects the viewer may add proposals to by hand (not agent-first). */
export const manualProjects = async (v: Viewer) => (await listProjects(v, "active")).filter((x) => !x.agentFirst && can(v, "delivery:proposal:create", { projectId: x.id }));

export type ProposalRow = {
  id: string; key: string; title: string; phase: Phase; tasksDone: number; tasksTotal: number; hours: number; estimateHours: number | null;
  /** 104 AC-9: hours on live entries named for it in weeks not yet approved; Time keeps it current (AC-10). */
  waitingHours: number;
  ownerName: string | null; ownerUserId: string | null; description: string | null; withdrawn: boolean; agent: string | null; projectKey: string; projectName: string; projectColor: string;
  release: string | null; shippedTo: string | null; shippedStatus: string | null; inProd: boolean; source: string | null; meta: Record<string, unknown>; createdAt: string | null; updatedAt: string | null;
};

const proposal = (r: Record<string, unknown>): ProposalRow => ({
  id: r.id as string, key: r.key as string, title: r.title as string, phase: r.phase as Phase, tasksDone: Number(r.tasks_done), tasksTotal: Number(r.tasks_total),
  hours: Number(r.hours), estimateHours: num(r.estimate_hours), waitingHours: Number(r.waiting_hours ?? 0), ownerName: ((r.owner_shown ?? r.owner_name) as string | null) ?? null,
  ownerUserId: (r.owner_user_id as string | null) ?? null, description: (r.description as string | null) ?? null,
  withdrawn: isWithdrawn(r), agent: (r.agent as string | null) ?? null,
  projectKey: r.project_key as string, projectName: r.project_name as string, projectColor: r.project_color as string,
  release: (r.version as string | null) ?? null, shippedTo: (r.shipped_to as string | null) ?? null, shippedStatus: (r.shipped_status as string | null) ?? null, inProd: r.in_prod === true,
  source: (r.source as string | null) ?? null, meta: (r.meta as Record<string, unknown>) ?? {}, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});

// The furthest environment each release reached, for "Shipped to".
const PROPOSALS = sql`
  select p.*, pr.key as project_key, pr.name as project_name, pr.color as project_color, r.version, last.name as shipped_to, last.status as shipped_status,
    -- 092 AC-5: In Prod means a deployment of its release that released it (deployment.released, recorded when it was
    -- written, 0005, so re-marking which environment is Prod can't change it) and isn't voided.
    ${proposalInProd} as in_prod,
    ${ownerShownIn("p")} as owner_shown
  from delivery.proposal p
  join delivery.project pr on pr.id = p.project_id
  left join delivery.release r on r.id = p.release_id
  left join lateral (
    select e.name, d.status from delivery.deployment d join delivery.environment e on e.id = d.environment_id
    where d.release_id = p.release_id and d.voided_at is null order by e.position desc, d.at desc limit 1) last on true`;

// Withdrawn: by the repo (meta.withdrawn, spec proposals) or by hand (withdrawn_at, 081).
export const ACTIVE = sql`not ${withdrawnIn("p")}`;

/** 081 amendment 9 (AC-87): `ownerUserId` keeps one person's proposals (the Mine filter). */
export type ProposalFilter = { phase?: Phase; projectKey?: string; q?: string; ownerUserId?: string };

/**
 * 081 AC-16: the one rule lists, counts and charts share. Never withdrawn; a project's own views show it whatever its
 * status, the portfolio shows active projects only (as listProjects does); `q` matches key or title.
 */
const scope = (f: ProposalFilter) => {
  const like = f.q?.trim() ? `%${f.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const where = [ACTIVE, f.projectKey ? sql`pr.key = ${f.projectKey}` : sql`pr.status = 'active'`, f.phase ? sql`p.phase = ${f.phase}` : undefined,
    like ? sql`(p.key ilike ${like} or p.title ilike ${like})` : undefined, f.ownerUserId ? sql`p.owner_user_id = ${f.ownerUserId}` : undefined].filter(Boolean);
  return sql.join(where as ReturnType<typeof sql>[], sql` and `);
};

export const listProposals = (v: Viewer, opts: ProposalFilter = {}) =>
  read(v, async (tx) => (await tx.execute(sql`${PROPOSALS} where ${scope(opts)} order by p.updated_at desc, p.key desc`)).map(proposal));

/** 081 amendment 9 (AC-85): a project's open proposals, the likeliest for this person first, each saying why. */
export type LikelyProposal = { key: string; title: string; phase: Phase; mine: boolean; why: string };
const PHASE_WORD: Record<Phase, string> = { proposed: "Proposed", planned: "Planned", building: "Building", verified: "Verified", released: "Released" };
const shortDay = (d: unknown) => new Date(String(d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const likelyProposals = (v: Viewer, projectKey: string) =>
  read(v, async (tx) => {
    const me = v.userId;
    const rows = await tx.execute(sql`select p.key, p.title, p.phase, coalesce(p.owner_user_id::text = ${me}, false) as mine, w.ref as worked_ref, w.done_at as worked_at
      from delivery.proposal p join delivery.project pr on pr.id = p.project_id
      left join lateral (select t.ref, t.done_at from delivery.task t where t.proposal_id = p.id and t.done and t.done_at > now() - interval '14 days'
        and (t.done_by = ${`user:${me}`} or t.done_by like ${`% for user:${me}`}) order by t.done_at desc limit 1) w on true
      where pr.key = ${projectKey} and ${ACTIVE} and p.phase <> 'released'
      order by (coalesce(p.owner_user_id::text = ${me}, false) and p.phase = 'building') desc, coalesce(p.owner_user_id::text = ${me}, false) desc, w.done_at desc nulls last,
        array_position(array['building', 'verified', 'planned', 'proposed'], p.phase::text), p.updated_at desc, p.key limit 5`);
    return rows.map((r): LikelyProposal => {
      const phase = r.phase as Phase, mine = Boolean(r.mine);
      const why = mine ? `yours · ${PHASE_WORD[phase]}` : r.worked_ref ? `you closed ${r.worked_ref as string} on ${shortDay(r.worked_at)}` : PHASE_WORD[phase];
      return { key: r.key as string, title: r.title as string, phase, mine, why };
    });
  });

/** One project by key, or by id (059: pins use the id; a key given with it only narrows). */
export const getProject = (v: Viewer, key: string | undefined, projectId?: string) =>
  read(v, async (tx) => {
    if (!key && !projectId) throw invalid("say which project: a projectId or a key");
    const where = sql.join([projectId ? sql`id = ${projectId}` : undefined, key ? sql`key = ${key}` : undefined].filter((x) => x !== undefined), sql` and `);
    const [r] = await tx.execute(sql`select *, ${agentFirstSql(sql`delivery.project`)} as agent_first from delivery.project where ${where}`);
    if (!r) return null;
    const proposals = (await tx.execute(sql`${PROPOSALS} where pr.id = ${r.id} and ${ACTIVE} order by p.updated_at desc, p.key desc`)).map(proposal);
    // 081 amendment 4 (AC-42): who closed the project's recorded tasks: agents, people (in amax or by a verified commit),
    // or automation (server/closed-by.ts).
    const [c] = await tx.execute(sql`select count(*) filter (where ${BY_AGENT})::int as agents, count(*) filter (where ${BY_PERSON})::int as people,
        count(*) filter (where not (${BY_AGENT}) and not ${BY_PERSON})::int as automation
      from delivery.task t join delivery.proposal p on p.id = t.proposal_id where p.project_id = ${r.id} and t.done and t.done_by is not null and ${ACTIVE}`);
    return { project: project(r), proposals, closedBy: { agents: Number(c?.agents ?? 0), people: Number(c?.people ?? 0), automation: Number(c?.automation ?? 0) } };
  });

/**
 * "Today" for a tenant's date windows: its delivery.clock_pin row (a validated date; the visual tests
 * pin fixtures.md's Oct 16, 2026), else the real date. Per tenant, module data, no process env.
 */
export const clockOf = async (tx: Tx): Promise<Date> => {
  const [r] = await tx.execute(sql`select today::text as today from delivery.clock_pin`);
  return r ? new Date(`${r.today as string}T15:00:00Z`) : new Date();
};
export const today = (v: Viewer) => read(v, clockOf);
/** The end of "today" (UTC): windows stop there, so a pin earlier than real time never counts later rows (final review). */
export const endOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();

const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
};
const monday = (d: Date) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t; };

/** Last 8 ISO weeks ending this week: labels W35…W42 and their Mondays. */
export function lastWeeks(now: Date, n = 8) {
  const m = monday(now);
  return Array.from({ length: n }, (_, i) => { const d = new Date(m.getTime() - (n - 1 - i) * 7 * 86_400_000); return { label: `W${isoWeek(d)}`, monday: d.toISOString().slice(0, 10) }; });
}

/**
 * Portfolio tasks planned and done per week, from the portfolio roll-up (the project_id-null row;
 * per-project rows are not summed into it, review round 1). A week with no roll-up is null, not 0:
 * until ingestion (008) writes them there is no data, and the chart says so.
 */
export const weeklyThroughput = (v: Viewer, now?: Date) =>
  read(v, async (tx) => {
    const weeks = lastWeeks(now ?? (await clockOf(tx)));
    const rows = await tx.execute(sql`select week::text as week, planned, done from delivery.weekly_stat where project_id is null and week >= ${weeks[0].monday}`);
    const at = (w: string) => rows.find((r) => r.week === w);
    const col = (k: "planned" | "done") => weeks.map((w) => { const r = at(w.monday); return r ? Number(r[k]) : null; });
    return { labels: weeks.map((w) => w.label), planned: col("planned"), done: col("done") };
  });

/**
 * Proposals that reached Prod per ISO week, from proposal.released_at: the same source as
 * phaseCounts' "Released this month", so the two never disagree (review round 1).
 */
// 094 AC-4: shipped to Prod means a Prod deployment released it (deployment.released, not voided), the In Prod rule
// (092 AC-5). A proposal the repo's archive brought in as Released history (091 AC-4) wasn't shipped by amax, so it
// isn't counted.
const shippedToProd = proposalInProd;

export const shippedPerWeek = (v: Viewer, now?: Date, f: Pick<ProposalFilter, "projectKey" | "ownerUserId"> = {}) =>
  read(v, async (tx) => {
    const at = now ?? (await clockOf(tx));
    const weeks = lastWeeks(at);
    const rows = await tx.execute(sql`select date_trunc('week', p.released_at at time zone 'UTC')::date::text as week, count(*)::int as n
      from delivery.proposal p join delivery.project pr on pr.id = p.project_id
      where p.phase = 'released' and ${shippedToProd} and p.released_at >= ${`${weeks[0].monday}T00:00:00Z`} and p.released_at < ${endOfDay(at)} and ${scope(f)} group by 1`);
    return { labels: weeks.map((w) => w.label), values: weeks.map((w) => Number(rows.find((r) => r.week === w.monday)?.n ?? 0)) };
  });

// In flight = not released; released this month = reached Prod since the 1st (UTC).
export const phaseCounts = (v: Viewer, at?: Date, f: Pick<ProposalFilter, "projectKey" | "ownerUserId"> = {}) =>
  read(v, async (tx) => {
    const now = at ?? (await clockOf(tx));
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const rows = await tx.execute(sql`select p.phase, count(*)::int as n, count(*) filter (where ${shippedToProd} and p.released_at >= ${month} and p.released_at < ${endOfDay(now)})::int as this_month
      from delivery.proposal p join delivery.project pr on pr.id = p.project_id where ${scope(f)} group by p.phase`);
    const get = (p: Phase) => rows.find((r) => r.phase === p);
    const counts = { proposed: Number(get("proposed")?.n ?? 0), planned: Number(get("planned")?.n ?? 0), building: Number(get("building")?.n ?? 0), verified: Number(get("verified")?.n ?? 0) };
    // 081 AC-25: the month "released this month" counted (UTC, by the tenant's clock), so labels can name it.
    const monthName = now.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
    return { ...counts, inFlight: counts.proposed + counts.planned + counts.building + counts.verified, releasedThisMonth: Number(get("released")?.this_month ?? 0), month: monthName };
  });

/** 081 AC-17: the Proposals page's two metric cards as one read, for their pins and for chat. */
export const proposalMetrics = async (v: Viewer, f: Pick<ProposalFilter, "projectKey"> = {}) => {
  const [counts, shipped] = await Promise.all([phaseCounts(v, undefined, f), shippedPerWeek(v, undefined, f)]);
  return { projectKey: f.projectKey ?? null, ...counts, shippedPerWeek: shipped };
};

export type ReleaseRow = {
  id: string; projectId: string; version: string; projectKey: string; projectName: string; projectColor: string; proposals: number; createdAt?: string | null;
  stages: { environment: string; environmentId: string; deploymentId: string | null; position: number; isProd: boolean; status: string | null; at: string | null; note: string | null; run: string | null }[];
};

export const listReleases = (v: Viewer, opts: { projectKey?: string } = {}) =>
  read(v, async (tx) => {
    const envs = await tx.execute(sql`select * from delivery.environment order by project_id, position`);
    const releases = await tx.execute(sql`select r.*, pr.key as project_key, pr.name as project_name, pr.color as project_color,
      (select count(*)::int from delivery.proposal p where p.release_id = r.id) as proposals
      from delivery.release r join delivery.project pr on pr.id = r.project_id ${opts.projectKey ? sql`where pr.key = ${opts.projectKey}` : sql``} order by r.created_at desc`);
    const deps = await tx.execute(sql`select distinct on (release_id, environment_id) * from delivery.deployment where voided_at is null order by release_id, environment_id, at desc`);
    return releases.map((r): ReleaseRow => ({
      id: r.id as string, projectId: r.project_id as string, version: r.version as string, projectKey: r.project_key as string, projectName: r.project_name as string,
      projectColor: r.project_color as string, proposals: Number(r.proposals), createdAt: iso(r.created_at),
      stages: envs.filter((e) => e.project_id === r.project_id).map((e) => {
        const d = deps.find((x) => x.release_id === r.id && x.environment_id === e.id);
        return { environment: e.name as string, environmentId: e.id as string, deploymentId: (d?.id as string | undefined) ?? null, position: Number(e.position), isProd: Boolean(e.is_prod), status: (d?.status as string | null) ?? null,
          at: d ? new Date(d.at as string).toISOString() : null, note: (d?.note as string | null) ?? null, run: (d?.pipeline_run as string | null) ?? null };
      }),
    }));
  });

/**
 * Columns for every release view: the union of the projects' environment names, in an order that
 * agrees with every project's own stage order (a topological merge; ties by position, then name).
 * Only when projects contradict each other (A before B in one, B before A in another) does the
 * rest fall back to position order (review round 2).
 */
export function stageColumns(releases: ReleaseRow[]): string[] {
  const after = new Map<string, Set<string>>();
  const minPos = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of releases) {
    const own = [...r.stages].sort((a, b) => a.position - b.position);
    own.forEach((s, i) => {
      minPos.set(s.environment, Math.min(minPos.get(s.environment) ?? Infinity, s.position));
      if (!after.has(s.environment)) after.set(s.environment, new Set());
      if (i > 0 && !seen.has(`${own[i - 1].environment}>${s.environment}`)) { seen.add(`${own[i - 1].environment}>${s.environment}`); after.get(own[i - 1].environment)!.add(s.environment); }
    });
  }
  const incoming = new Map([...after.keys()].map((e) => [e, 0]));
  for (const next of after.values()) for (const e of next) incoming.set(e, incoming.get(e)! + 1);
  const byPos = (a: string, b: string) => minPos.get(a)! - minPos.get(b)! || a.localeCompare(b);
  const out: string[] = [];
  const left = new Set(after.keys());
  while (left.size) {
    const ready = [...left].filter((e) => incoming.get(e) === 0).sort(byPos);
    const e = ready[0] ?? [...left].sort(byPos)[0];
    left.delete(e);
    out.push(e);
    for (const n of after.get(e)!) incoming.set(n, incoming.get(n)! - 1);
  }
  return out;
}

export type EnvironmentRow = { id: string; name: string; position: number; isProd: boolean; deployments: number; createdAt: string | null };

export const listEnvironments = (v: Viewer, projectKey: string) =>
  read(v, async (tx) => (await tx.execute(sql`select e.id, e.name, e.position, e.is_prod, e.created_at, (select count(*)::int from delivery.deployment d where d.environment_id = e.id) as deployments
    from delivery.environment e join delivery.project p on p.id = e.project_id where p.key = ${projectKey} order by e.position`))
    .map((e): EnvironmentRow => ({ id: e.id as string, name: e.name as string, position: Number(e.position), isProd: Boolean(e.is_prod), deployments: Number(e.deployments), createdAt: iso(e.created_at) })));

export type DeploymentRow = { id: string; environment: string; status: string; at: string; note: string | null; run: string | null; recordedBy: string; voidedAt: string | null; voidReason: string | null };

/**
 * Which record a read names (057), one rule for releases, environments and deployments: its id, or its
 * natural key in full. Anything less is refused ("say which ..."), never read as "not found". With an
 * id, any key part also given only narrows: a mismatch reads as not found.
 */
export type ReleaseRef = { releaseId?: string; projectKey?: string; version?: string };
export function checkReleaseRef(ref: ReleaseRef) {
  if (!ref.releaseId && !(ref.projectKey && ref.version)) throw invalid("say which release: a releaseId, or a projectKey and version");
}
export function releaseWhere(ref: ReleaseRef) {
  checkReleaseRef(ref);
  const parts = [ref.releaseId ? sql`r.id = ${ref.releaseId}` : undefined, ref.projectKey ? sql`p.key = ${ref.projectKey}` : undefined, ref.version ? sql`r.version = ${ref.version}` : undefined];
  return sql.join(parts.filter((x) => x !== undefined), sql` and `);
}
/** True when a release row is the one the ref names (the same rule as releaseWhere). */
export function isRelease(r: { id: string; projectKey: string; version: string }, ref: ReleaseRef) {
  checkReleaseRef(ref);
  return (!ref.releaseId || r.id === ref.releaseId) && (!ref.projectKey || r.projectKey === ref.projectKey) && (!ref.version || r.version === ref.version);
}

/** One release with its proposals and full deployment history, voided ones included. */
export const getRelease = (v: Viewer, projectKey: string | undefined, version: string | undefined, releaseId?: string) =>
  read(v, async (tx) => {
    // By id when given: a pin keyed on the id survives a re-tag (057). By project key and version otherwise.
    const where = releaseWhere({ releaseId, projectKey, version });
    const [r] = await tx.execute(sql`select r.*, p.key as project_key, p.name as project_name, p.id as pid from delivery.release r join delivery.project p on p.id = r.project_id where ${where}`);
    if (!r) return null;
    const history = (await tx.execute(sql`select d.*, e.name as env from delivery.deployment d join delivery.environment e on e.id = d.environment_id where d.release_id = ${r.id} order by d.at desc`))
      .map((d): DeploymentRow => ({ id: d.id as string, environment: d.env as string, status: d.status as string, at: new Date(d.at as string).toISOString(), note: (d.note as string | null) ?? null, run: (d.pipeline_run as string | null) ?? null,
        recordedBy: d.recorded_by as string, voidedAt: d.voided_at ? new Date(d.voided_at as string).toISOString() : null, voidReason: (d.void_reason as string | null) ?? null }));
    const proposals = (await tx.execute(sql`select id, key, title, phase, release_id = ${r.id} as included from delivery.proposal where project_id = ${r.pid} order by key`))
      .map((p) => ({ id: p.id as string, key: p.key as string, title: p.title as string, phase: p.phase as Phase, included: Boolean(p.included) }));
    return { id: r.id as string, version: r.version as string, projectKey: r.project_key as string, projectName: r.project_name as string, createdAt: iso(r.created_at), history, proposals };
  });

// One-record reads for row pins (057): a pin resolves to the row it sits on, never the whole list.
/**
 * One proposal by id, or by key (CON-12), or null. The specclaw sync can move a key to another
 * proposal (ProposalRekeyed), so pins use the id (059); a key given with it only narrows. 081 AC-8: one row,
 * read directly; a withdrawn proposal is still found (marked `withdrawn`), since its page and pins stay.
 */
export const getProposal = (v: Viewer, ref: { proposalId?: string; key?: string }) => {
  if (!ref.proposalId && !ref.key) throw invalid("say which proposal: a proposalId or a key");
  return read(v, (tx) => proposalWhere(tx, ref));
};

export async function proposalWhere(tx: Tx, ref: { proposalId?: string; key?: string }) {
  const where = sql.join([ref.proposalId ? sql`p.id::text = ${ref.proposalId}` : undefined, ref.key ? sql`p.key = ${ref.key}` : undefined].filter((x) => x !== undefined), sql` and `);
  const [r] = await tx.execute(sql`${PROPOSALS} where ${where}`);
  return r ? proposal(r) : null;
}

/**
 * One environment by id, or by project key and name, or null (057). The id survives a rename, so row
 * pins use it; a project key, when given with an id, only narrows.
 */
export const getEnvironment = async (v: Viewer, ref: { environmentId?: string; projectKey?: string; name?: string }) => {
  if (!ref.environmentId && !(ref.projectKey && ref.name)) throw invalid("say which environment: an environmentId, or a projectKey and name");
  const [hit] = await read(v, (tx) => tx.execute(ref.environmentId
    ? sql`select p.key from delivery.environment e join delivery.project p on p.id = e.project_id where e.id = ${ref.environmentId}`
    : sql`select p.key from delivery.project p where p.key = ${ref.projectKey!}`));
  if (!hit || (ref.projectKey && ref.projectKey !== hit.key)) return null;
  const e = (await listEnvironments(v, hit.key as string)).find((x) => (ref.environmentId ? x.id === ref.environmentId : x.name === ref.name));
  // An id and a name that point at different environments is a confused call: refuse it, don't pick one (057).
  if (e && ref.environmentId && ref.name !== undefined && ref.name !== e.name) throw invalid(`say which environment: ${ref.environmentId} is ${e.name}, not ${ref.name}`);
  return e ? { projectKey: hit.key as string, ...e } : null;
};

/**
 * One deployment by its id, voided or not, or null (057). The id is the key: a re-tag doesn't move it.
 * A project key or version, when given, only narrows: a mismatch reads as not found.
 */
export const getDeployment = async (v: Viewer, deploymentId: string, scope: { projectKey?: string; version?: string } = {}) => {
  const [hit] = await read(v, (tx) => tx.execute(sql`select r.id as release_id, r.version, p.key as project_key from delivery.deployment d
    join delivery.release r on r.id = d.release_id join delivery.project p on p.id = r.project_id where d.id = ${deploymentId}`));
  if (!hit || (scope.projectKey && scope.projectKey !== hit.project_key) || (scope.version && scope.version !== hit.version)) return null;
  const d = (await getRelease(v, undefined, undefined, hit.release_id as string))?.history.find((x) => x.id === deploymentId);
  return d ? { projectKey: hit.project_key as string, version: hit.version as string, ...d } : null;
};

/** 081 amendment 11 (AC-99): one task, for its row's pin. By id; a proposal key only narrows (a mismatch is not found). */
export type ProposalTaskRow = { id: string; ref: string; title: string; done: boolean; doneAt: string | null; proposalId: string; proposalKey: string; proposalTitle: string; projectId: string; phase: Phase; withdrawn: boolean; createdAt: string | null };
export const getProposalTask = (v: Viewer, taskId: string, scope: { key?: string } = {}) =>
  read(v, async (tx): Promise<ProposalTaskRow | null> => {
    const [t] = await tx.execute(sql`select t.id, t.ref, t.title, t.done, t.done_at, p.id as proposal_id, p.key, p.title as proposal_title, p.project_id, p.phase, not ${ACTIVE} as withdrawn
      from delivery.task t join delivery.proposal p on p.id = t.proposal_id where t.id::text = ${taskId}`);
    if (!t || (scope.key && scope.key !== t.key)) return null;
    return { id: t.id as string, ref: t.ref as string, title: t.title as string, done: Boolean(t.done), doneAt: iso(t.done_at), proposalId: t.proposal_id as string,
      proposalKey: t.key as string, proposalTitle: t.proposal_title as string, projectId: t.project_id as string, phase: t.phase as Phase, withdrawn: Boolean(t.withdrawn), createdAt: null };
  });
