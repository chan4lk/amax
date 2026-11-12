import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import { ForbiddenError, getRuntime, provided, slotsSet } from "@amax/core/server";
import { EVENTS, PROPOSAL_TIME_SLOT, proposalHref, type ProposalTimeLine, type ProposalTimeSource } from "../contracts";
import { day } from "../pins";
import { byLine } from "./activity";
import { proposalWhere, type ProposalRow } from "./queries";
import { invalid, unavailable } from "./refusal";
import { resolveRepoPhases } from "./repo-time";
import { readParts } from "../sync/sha";

export type ProposalTask = { id: string; ref: string; title: string; done: boolean; doneAt: string | null };
export type ProposalStage = { environment: string; environmentId: string; deploymentId: string | null; isProd: boolean; status: string | null; at: string | null };
// 081 amendment 4 (AC-50): each line's kind picks its icon on the timeline; a move also says the phase it entered (AC-47).
export type EventKind = "created" | "moved" | "task" | "reopened" | "time" | "edited" | "withdrawn" | "synced";
/** `id` names the line within its proposal (review round 1, R3: each line pins through get_proposal_event). */
export type ProposalEvent = { id: string; at: string; text: string; by: string; kind: EventKind; to?: string };
export type ProposalDetail = ProposalRow & {
  href: string;
  project: { id: string; key: string; name: string; status: string };
  withdrawnAt: string | null; withdrawReason: string | null; releasedAt: string | null; sourceRef: string | null;
  tasks: ProposalTask[]; stages: ProposalStage[]; history: ProposalEvent[]; timeNote: TimeNote;
};

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const KIND: Record<string, string> = { user: "user", agent: "agent", sp: "service" };

// "user:…", "agent:claude", "sp:…", "job:…": the actor's kind and the names byLine() writes "Claude for Nimal" from.
function who(actor: string | null, forUser: string | null, names: Map<string, string>) {
  const [prefix, id] = [(actor ?? "").split(":")[0], (actor ?? "").slice((actor ?? "").indexOf(":") + 1)];
  const kind = KIND[prefix] ?? "system";
  return byLine({ actor_kind: kind, actor_id: actor ?? "", actor_name: names.get(id), principal_name: names.get(id), for_name: forUser ? names.get(forUser.replace(/^user:/, "")) : null });
}

const ACTION: Record<string, (a: Record<string, unknown>) => string> = {
  "delivery.proposal.create": (a) => `Created${a.estimateHours ? `, estimate ${a.estimateHours} h` : ""}`,
  "delivery.proposal.sync": () => "Synced from the repo",
  "delivery.proposal.rekey": (a) => `Renamed to ${a.key as string}`,
  "delivery.proposal.update": (a) => `Edited ${Object.keys(a).join(", ")}`,
  "delivery.proposal.withdraw": (a) => `Withdrawn: ${a.reason as string}`,
  "delivery.task.add": (a) => `Added task ${a.ref as string} ${a.title as string}`,
  "delivery.task.reopen": (a) => `${a.ref as string} ${a.title as string} reopened`,
};
const KIND_OF: Record<string, EventKind> = {
  "delivery.proposal.create": "created", "delivery.proposal.sync": "synced", "delivery.proposal.rekey": "edited", "delivery.proposal.update": "edited",
  "delivery.proposal.withdraw": "withdrawn", "delivery.task.add": "task", "delivery.task.reopen": "reopened",
};
// 094 AC-3: the phases a spec change reached in its repo (state.json, kept in meta.repoPhases by the sync).
const REPO_PHASE: Record<string, string> = { proposal: "Approved", tasks: "Tasks planned", verify: "Verified", pr: "PR raised", archived: "Archived" };
// Rule 4: the repo's own record, not amax's; who worked on the change shows as the proposal's owner and its tasks.
// 096: by the one read rule (sync/sha.ts); a stored source that isn't a read shows as plain "From the repo".
const repoBy = (source: unknown) => {
  const read = readParts(source);
  return read ? `From the repo, read at ${read.ref}@${read.sha.slice(0, 7)}` : "From the repo";
};
async function repoLines(tx: Tx, id: string, only?: Only): Promise<ProposalEvent[]> {
  if (only && only.kind !== "repo") return [];
  const [p] = await tx.execute(sql`select source, meta->'repoPhases' as phases from delivery.proposal where id = ${id}`);
  if (!p?.source) return [];
  // Each phase names the read that recorded it (review round 3), kept with its time when a later sync carries it forward.
  return Object.entries(resolveRepoPhases(undefined, null, p.phases) ?? {})
    .filter(([k]) => REPO_PHASE[k] && (!only || only.ref === k))
    .map(([k, e]) => ({ id: `repo:${k}`, at: iso(e.at)!, text: `${REPO_PHASE[k]} in the repo`, by: repoBy(e.source), kind: "synced" as const }));
}
const LABEL: Record<string, string> = { proposed: "Proposed", planned: "Planned", building: "Building", verified: "Verified", released: "Released" };

// 081 AC-28 (NFR-3): time logged against the proposal (log, correct, delete, and a change request applied by an approver),
// by its id, never its key, so a rekey keeps them. Time decides which lines this viewer may see, by its own rule (the
// entry's owner, or an approver of the project in the owner's entity, Q8), and fills PROPOSAL_TIME_SLOT with them;
// everyone else has the approved total (D2). Delivery only words them. Review round 1: no second copy of Time's rule here.
const hrs = (n: unknown) => `${Number(Number(n).toFixed(2))} h`;

/**
 * 087 AC-8, AC-9: why the history may not show every time line: "unread" when no Time source answered (slots never set, or Time off),
 * "partial" when Time stopped at its bound. Null when it shows them all.
 */
export type TimeNote = "unread" | "partial" | null;

async function timeRows(tx: Tx, id: string, v: Viewer, projectId: string, line?: string): Promise<{ lines: ProposalTimeLine[]; note: TimeNote }> {
  const sources = provided<ProposalTimeSource>(PROPOSAL_TIME_SLOT);
  // Review round 3, 087 AC-7: a pinned time line with no module to ask is unavailable, never "gone" (null).
  // 087 final pass: one rule for the page and a pin. No Time source (slots never set, or Time switched off) means the time
  // lines weren't read: a pin is refused as unavailable, the page says so. Never "no time was logged".
  const asked = slotsSet() && sources.length > 0;
  if (line && !asked) throw unavailable("time lines can't be read here: the Time module isn't running");
  if (!asked) return { lines: [], note: "unread" };
  const read = await Promise.all(sources.map((source) => source(tx, v, { id, projectId }, line ? { line } : undefined)));
  return { lines: read.flatMap((r) => r.lines), note: read.some((r) => r.partial) ? "partial" : null };
}

/** Review round 2 (B3): one history line by its kind and id ("audit:12", "event:…", "task:…", "time:…"), read directly. */
type Only = { kind: "audit" | "event" | "task" | "time" | "repo"; ref: string };
const one = (only: Only | undefined, kind: Only["kind"], where: ReturnType<typeof sql>) => (!only ? sql`true` : only.kind === kind ? where : sql`false`);

function timeText(a: ProposalTimeLine, id: string, owner: string) {
  const when = a.day ? ` for ${day(`${a.day}T12:00:00Z`)}` : "";
  if (a.deleted) return `Removed ${owner}'s ${hrs(a.hours)}${when}`;
  if (!("previousProposalId" in a)) return `${owner} logged ${hrs(a.hours)}${when}`;
  if (a.proposalId !== id) return `Moved ${owner}'s ${hrs(a.hours)}${when} off this proposal`;
  if (a.previousProposalId !== id) return `Put ${owner}'s ${hrs(a.hours)}${when} on this proposal`;
  return `Corrected ${owner}'s entry${when} to ${hrs(a.hours)}`;
}

// The page shows the newest 100 of each source; `only` reads one line with no window (a pin on an older line still resolves).
async function historyOf(tx: Tx, id: string, v: Viewer, projectId: string, only?: Only): Promise<{ events: ProposalEvent[]; timeNote: TimeNote }> {
  const ref = only?.ref ?? "";
  const audits = await tx.execute(sql`select seq, occurred_at as at, actor, on_behalf_of, action, after from core.audit_event
    where resource in ('delivery.proposal', 'delivery.task') and (resource_id = ${id} or (resource = 'delivery.task' and after->>'proposalId' = ${id}))
      and ${one(only, "audit", sql`seq::text = ${ref}`)} order by occurred_at desc, seq desc limit 100`);
  const moves = await tx.execute(sql`select id, created_at as at, payload from core.event where name = ${EVENTS.proposalPhaseChanged} and payload->>'proposalId' = ${id}
      and ${one(only, "event", sql`id::text = ${ref}`)} order by created_at desc limit 100`);
  const { lines: time, note: timeNote } = !only || only.kind === "time" ? await timeRows(tx, id, v, projectId, only ? `time:${ref}` : undefined) : { lines: [], note: null };
  // Closed tasks come from the task rows: who closed each is on the row ("user:…", or "agent:… for user:…").
  const closed = await tx.execute(sql`select id, ref, title, done_at as at, done_by from delivery.task where proposal_id = ${id} and done and done_at is not null
      and ${one(only, "task", sql`id::text = ${ref}`)}`);
  const ids = new Set<string>();
  const add = (s: unknown) => { for (const m of String(s ?? "").matchAll(/(?:user|sp):([0-9a-f-]{36})/g)) ids.add(m[1]); };
  for (const a of audits) { add(a.actor); add(a.on_behalf_of); }
  for (const t of time) { add(t.actor); add(t.onBehalfOf); add(`user:${t.userId}`); }
  for (const m of moves) add((m.payload as { by: string }).by);
  for (const t of closed) add(t.done_by);
  const names = new Map((await tx.execute(sql`select id::text as id, name from auth.user where id::text in (${sql.join([...ids, ""].map((x) => sql`${x}`), sql`, `)})
    union all select id::text, name from auth.service_principal where id::text in (${sql.join([...ids, ""].map((x) => sql`${x}`), sql`, `)})`)).map((r) => [r.id as string, r.name as string]));
  const lines: ProposalEvent[] = [
    ...audits.filter((a) => ACTION[a.action as string]).map((a) => ({ id: `audit:${String(a.seq)}`, at: iso(a.at)!, text: ACTION[a.action as string]((a.after as Record<string, unknown>) ?? {}), by: who(a.actor as string, a.on_behalf_of as string | null, names), kind: KIND_OF[a.action as string] })),
    ...time.map((t) => ({ id: t.id, at: iso(t.at)!, text: timeText(t, id, names.get(t.userId) ?? "Someone"), by: who(t.actor, t.onBehalfOf, names), kind: "time" as const })),
    ...moves.map((m) => {
      const p = m.payload as { from: string; to: string; by: string };
      const [actor, forUser] = p.by.split(" for ");
      return { id: `event:${m.id as string}`, at: iso(m.at)!, text: `Moved ${LABEL[p.from] ?? p.from} → ${LABEL[p.to] ?? p.to}`, by: who(actor, forUser ?? null, names), kind: "moved" as const, to: p.to };
    }),
    ...closed.map((t) => {
      const [actor, forUser] = String(t.done_by ?? "").split(" for ");
      return { id: `task:${t.id as string}`, at: iso(t.at)!, text: `${t.ref as string} ${t.title as string} done`, by: who(actor || null, forUser ?? null, names), kind: "task" as const };
    }),
  ];
  lines.push(...(await repoLines(tx, id, only)));
  return { events: lines.sort((a, b) => b.at.localeCompare(a.at)), timeNote };
}

/**
 * Review 081 round 1 (R3), round 2 (B3): one line of a proposal's history, for its pin, looked up by its kind and id with
 * no window, worded as the page words it. Null when the proposal or the line is gone; a time line the viewer may not see
 * is refused by Time (forbidden), so "not yours to see" never reads as "gone".
 */
export async function proposalEvent(v: Viewer, a: { proposalId: string; line: string }) {
  const at = a.line.indexOf(":");
  const kind = a.line.slice(0, at), ref = a.line.slice(at + 1);
  if (!["audit", "event", "task", "time", "repo"].includes(kind) || !ref) throw invalid("a history line id such as audit:12");
  if (!can(v, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, v.tenantId, async (tx) => {
    const row = await proposalWhere(tx, { proposalId: a.proposalId });
    if (!row) return null;
    const [p] = await tx.execute(sql`select project_id from delivery.proposal where id = ${row.id}`);
    const [e] = (await historyOf(tx, row.id, v, p.project_id as string, { kind: kind as Only["kind"], ref })).events;
    return e && e.id === a.line ? { ...e, line: e.id, proposalId: row.id, key: row.key, title: row.title } : null;
  });
}

/** 081 AC-6, AC-8: one proposal with its project, tasks, release stages and history; null when there is none. */
export const proposalDetail = (v: Viewer, ref: { proposalId?: string; key?: string }) => {
  if (!ref.proposalId && !ref.key) throw invalid("say which proposal: a proposalId or a key");
  if (!can(v, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, v.tenantId, async (tx): Promise<ProposalDetail | null> => {
    const row = await proposalWhere(tx, ref);
    if (!row) return null;
    const [p] = await tx.execute(sql`select p.project_id, p.release_id, p.withdrawn_at, p.withdraw_reason, p.released_at, p.source_ref, pr.key, pr.name, pr.status
      from delivery.proposal p join delivery.project pr on pr.id = p.project_id where p.id = ${row.id}`);
    const tasks = (await tx.execute(sql`select id, ref, title, done, done_at from delivery.task where proposal_id = ${row.id} order by length(ref), ref`))
      .map((t) => ({ id: t.id as string, ref: t.ref as string, title: t.title as string, done: Boolean(t.done), doneAt: iso(t.done_at) }));
    const stages = p.release_id ? (await tx.execute(sql`select e.id as environment_id, e.name, e.is_prod, d.id as deployment_id, d.status, d.at from delivery.environment e
        left join lateral (select id, status, at from delivery.deployment where release_id = ${p.release_id} and environment_id = e.id and voided_at is null order by at desc limit 1) d on true
        where e.project_id = ${p.project_id} order by e.position`)).map((e) => ({ environment: e.name as string, environmentId: e.environment_id as string, deploymentId: (e.deployment_id as string | null) ?? null, isProd: Boolean(e.is_prod), status: (e.status as string | null) ?? null, at: iso(e.at) })) : [];
    return { ...row, href: proposalHref(row.key), project: { id: p.project_id as string, key: p.key as string, name: p.name as string, status: p.status as string },
      withdrawnAt: iso(p.withdrawn_at), withdrawReason: (p.withdraw_reason as string | null) ?? null, releasedAt: iso(p.released_at), sourceRef: (p.source_ref as string | null) ?? null,
      tasks, stages, ...(({ events, timeNote }) => ({ history: events, timeNote }))(await historyOf(tx, row.id, v, p.project_id as string)) };
  });
};
