import { sql } from "drizzle-orm";
import { ForbiddenError } from "@amax/core/server";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import type { ProposalTimeLine, ProposalTimeSource } from "@amax/delivery/contracts";
import { entitiesOf } from "./chain";
import { mayFix } from "./entry";

type After = { proposalId?: string | null; previousProposalId?: string | null; userId?: string; day?: string; hours?: number; deleted?: boolean };
type Row = Record<string, unknown>;

/** The page shows a proposal's newest 100 time lines the viewer may see. */
export const MAX_LINES = 100;
export const BATCH = 200;
/** 087 AC-9: at most this many batches per page load; beyond it the lines are reported partial. */
export const MAX_BATCHES = 10;

const onProposal = (id: string) => sql`resource in ('time.entry', 'time.change_request') and (after->>'proposalId' = ${id} or after->>'previousProposalId' = ${id})`;

const lineOf = (r: Row, a: After & { userId: string }): ProposalTimeLine => ({
  id: `time:${String(r.seq)}`, at: new Date(r.at as string).toISOString(), actor: r.actor as string, onBehalfOf: (r.on_behalf_of as string | null) ?? null, userId: a.userId,
  day: a.day ?? null, hours: Number(a.hours ?? 0), proposalId: a.proposalId ?? null,
  ...("previousProposalId" in a ? { previousProposalId: a.previousProposalId ?? null } : {}), ...(a.deleted ? { deleted: true } : {}),
});

/** The rows of `rows` this viewer may see, as lines, by the rule every other path about an entry uses (mayFix). */
async function visible(tx: Tx, v: Viewer, projectId: string, rows: Row[]) {
  const owners = await entitiesOf(tx, rows.map((r) => (r.after as After).userId ?? "").filter(Boolean));
  return rows.flatMap((r) => {
    const a = r.after as After;
    return a.userId && mayFix(v, a.userId, projectId, owners.get(a.userId) ?? null) ? [lineOf(r, { ...a, userId: a.userId })] : [];
  });
}

/**
 * 081 AC-28, review round 1: the time lines on a proposal's page, which Time fills in Delivery's PROPOSAL_TIME_SLOT. From
 * Time's own audit rows (log, correct, delete, and a change request applied by an approver), by the proposal's id, so a
 * rekey keeps them. A viewer sees a line by mayFix: the entry's owner, or an approver of the project in the owner's legal
 * entity (071 AC-4). One rule, Time's, never a copy in Delivery.
 *
 * Review round 2 (B3): the rule is applied before the count, page by page, so the newest 100 are the newest the viewer may
 * see (an owner always gets their own, however many other people logged since). `opts.line` reads one line directly.
 */
export const proposalTimeLines: ProposalTimeSource = async (tx, v, proposal, opts) => {
  if (opts?.line) {
    const seq = opts.line.replace(/^time:/, "");
    const rows = await tx.execute(sql`select seq, occurred_at as at, actor, on_behalf_of, after from core.audit_event where ${onProposal(proposal.id)} and seq::text = ${seq}`);
    if (!rows.length) return { lines: [], partial: false };
    const lines = await visible(tx, v, proposal.projectId, rows);
    if (!lines.length) throw new ForbiddenError("time:read", "time.entry");
    return { lines, partial: false };
  }
  const out: ProposalTimeLine[] = [];
  let after: { at: unknown; seq: unknown } | null = null;
  for (let batch = 0; out.length < MAX_LINES; batch++) {
    // 087 review round 1: partial only when a row is really left unread, not when the last batch ended on the last row.
    if (batch === MAX_BATCHES) return { lines: out, partial: (await tx.execute(sql`select 1 from core.audit_event where ${onProposal(proposal.id)}
      and (occurred_at, seq) < (${after!.at}::timestamptz, ${after!.seq}::bigint) limit 1`)).length > 0 };
    const page: Row[] = await tx.execute(sql`select seq, occurred_at as at, actor, on_behalf_of, after from core.audit_event where ${onProposal(proposal.id)}
      ${after ? sql`and (occurred_at, seq) < (${after.at}::timestamptz, ${after.seq}::bigint)` : sql``} order by occurred_at desc, seq desc limit ${BATCH}`);
    out.push(...(await visible(tx, v, proposal.projectId, page)));
    if (page.length < BATCH) break;
    after = { at: page.at(-1)!.at, seq: page.at(-1)!.seq };
  }
  return { lines: out.slice(0, MAX_LINES), partial: false };
};
