import { sql, type SQL } from "drizzle-orm";
import { textArray, withTenant, type Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { getRuntime } from "@amax/core/server";
import type { Phase } from "../contracts";
import { read } from "./queries";
import { notFound } from "./refusal";
import { isWithdrawn } from "./readiness";
import { categoryLabel, statusLabel } from "./release-status";

type Row = Record<string, unknown>;

export const RELEASABLE: Phase[] = ["verified", "released"];

export const candidates = (tx: Tx, where: SQL) => tx.execute(sql`select p.id, p.key, p.title, p.phase, p.release_id, p.withdrawn_at, p.meta,
  r.version, r.category, r.status, pr.key as project_key from delivery.proposal p left join delivery.release r on r.id = p.release_id
  join delivery.project pr on pr.id = p.project_id where ${where} order by p.key`);

export const shippedElsewhere = (p: Row, releaseId: unknown) => p.phase === "released" && p.release_id != null && p.release_id !== releaseId;
// 129: held in another release, open or completed. A move out of either needs `reassign` (a completed release is final,
// so what it contains never changes silently); one Released there is refused outright (shippedElsewhere).
export const heldElsewhere = (p: Row, releaseId: unknown) => p.release_id != null && p.release_id !== releaseId;
const phaseWord = (p: Phase) => p.charAt(0).toUpperCase() + p.slice(1);
export function notReleasable(p: Row, releaseId: unknown) {
  if (isWithdrawn(p)) return `${p.key as string} was withdrawn; it can't go in a release`;
  if (shippedElsewhere(p, releaseId)) return `${p.key as string} already shipped in another release`;
  return RELEASABLE.includes(p.phase as Phase) ? null : `${p.key as string} is ${phaseWord(p.phase as Phase)}; only Verified or Released proposals can go in a release`;
}

export const releasable = (p: Row) => notReleasable(p, null) === null;

export const releaseState = (r: Row) => `${r.category ? `${categoryLabel(r.category as string)}, ` : ""}${statusLabel(r.status as string | null)}`;
export const whereItIs = (p: Row) => `${p.key as string} is already in ${p.project_key as string} ${p.version as string} (${releaseState(p)})`;
export const moveRefusal = (p: Row) => `${whereItIs(p)}; confirm moving it, or take it out there first`;

export type ReleaseProposal = { key: string; title: string; phase: Phase; inRelease: { version: string; category: string | null; status: string | null } | null };

export const releaseProposals = async (tx: Tx, projectKey: string): Promise<ReleaseProposal[]> =>
  (await candidates(tx, sql`pr.key = ${projectKey}`)).filter(releasable).map((p) => ({
    key: p.key as string, title: p.title as string, phase: p.phase as Phase,
    inRelease: heldElsewhere(p, null) ? { version: p.version as string, category: (p.category as string | null) ?? null, status: (p.status as string | null) ?? null } : null,
  }));

export const listReleaseProposals = (v: Viewer, projectKey: string) => read(v, async (tx) => {
  const [project] = await tx.execute(sql`select 1 from delivery.project where key = ${projectKey}`);
  if (!project) throw notFound(`no project ${projectKey}`);
  return releaseProposals(tx, projectKey);
});

type MoveInput = { projectKey: string; version?: string; proposalKeys?: string[]; reassign?: string[] };
const movesOf = (v: Viewer, a: MoveInput) => withTenant(getRuntime().db, v.tenantId, async (tx) => {
  const keys = (a.proposalKeys ?? []).filter((k) => (a.reassign ?? []).includes(k));
  const rows = keys.length ? await candidates(tx, sql`p.key = any(${textArray(keys)}) and pr.key = ${a.projectKey}`) : [];
  return rows.filter((p) => heldElsewhere(p, null) && p.version !== a.version);
});
const joined = (lines: string[], by: string) => (lines.length ? lines.join(by) : undefined);
export const releaseNote = async (v: Viewer, a: MoveInput) => joined((await movesOf(v, a)).map((p) => `${whereItIs(p)}: it moves to this release`), ". ");
export const movesLine = async (v: Viewer, a: MoveInput) => joined((await movesOf(v, a)).map((p) => `${p.key as string} from ${p.version as string} (${releaseState(p)})`), "; ");
