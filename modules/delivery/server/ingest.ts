import { withTenant } from "@amax/db";
import { findGitIdentity, personByEmail, type GitProvider } from "@amax/auth/git-identity";
import type { InboundEvent } from "@amax/core";
import { contextFor, getRuntime, logError } from "@amax/core/server";
import { suggestLink } from "../suggestions";
import { markTaskDone } from "./tasks";
import { draftCommitTime, hoursOf } from "./commit-time";

// 008 AC-2: GitHub and Azure DevOps pushes, already verified and deduplicated by 035.

export type Commit = { id: string; message: string; login: string | null; email: string | null; verified: boolean; at: string };
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** The commits a push event carries, or null for any other event. */
export function commitsOf(provider: string, headers: Headers, payload: unknown): Commit[] | null {
  const p = obj(payload);
  if (provider === "github" && headers.get("x-github-event") === "push") {
    // 071 AC-7: a commit already pushed on another ref (distinct: false) is skipped, so nothing is drafted twice.
    return (Array.isArray(p.commits) ? p.commits : []).filter((c: unknown) => obj(c).distinct !== false).map((c: unknown) => {
      const x = obj(c), a = obj(x.author);
      return { id: String(x.id ?? ""), message: String(x.message ?? ""), login: str(a.username), email: str(a.email), verified: obj(x.verification).verified === true, at: String(x.timestamp ?? "") };
    });
  }
  if (provider === "azure-devops" && p.eventType === "git.push") {
    return (Array.isArray(obj(p.resource).commits) ? (obj(p.resource).commits as unknown[]) : []).map((c) => {
      const x = obj(c), a = obj(x.author);
      return { id: String(x.commitId ?? ""), message: String(x.comment ?? ""), login: str(a.email), email: str(a.email), verified: false, at: String(a.date ?? "") };
    });
  }
  return null;
}

/** "CON-014 T3 done": the tasks a commit message closes. */
export const closedTasks = (message: string) => [...message.matchAll(/\b([A-Z][A-Z0-9]{1,9}-\d{3})\s+(T\d+)\s+done\b/gi)].map((m) => ({ key: m[1].toUpperCase(), task: m[2].toUpperCase() }));

/** Who a commit is attributed to: only a verified commit or a verified email for the identity counts. */
export async function authorOf(tenantId: string, provider: GitProvider, c: Commit) {
  return withTenant(getRuntime().db, tenantId, async (tx) => {
    const id = await findGitIdentity(tx, provider, { login: c.login, email: c.email });
    const emailOk = Boolean(id?.emailVerified && id.email && c.email && id.email.toLowerCase() === c.email.toLowerCase());
    if (id && (c.verified || emailOk)) return { userId: id.userId, candidate: null };
    return { userId: null, candidate: id ? null : await personByEmail(tx, c.email) };
  });
}

export async function ingestPush(e: InboundEvent) {
  const commits = commitsOf(e.provider, e.headers, e.payload);
  if (!commits) return;
  const provider = e.provider as GitProvider;
  for (const c of commits) {
    const who = await authorOf(e.tenantId, provider, c);
    if (!who.userId) {
      if (who.candidate && c.login) await suggestLink(e.tenantId, { provider, login: c.login, email: c.email, userId: who.candidate.id, name: who.candidate.name, commit: c.id });
      continue;
    }
    const ctx = contextFor.job(e.tenantId, "delivery.ingest", `user:${who.userId}`);
    const tasks = closedTasks(c.message);
    for (const t of tasks) await markTaskDone(ctx, { ...t, commit: c.id }).catch((err: unknown) => logError(`delivery.ingest ${t.key} ${t.task}`, err));
    // 008 AC-3: "Time: 1.5h" drafts hours for the first proposal the commit names, if the person's entity allows it.
    const hours = hoursOf(c.message);
    const day = c.at.slice(0, 10);
    if (hours && tasks[0] && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      await draftCommitTime(ctx, { userId: who.userId, key: tasks[0].key, day, hours, commit: c.id }).catch((err: unknown) => logError(`delivery.ingest time ${c.id}`, err));
    }
  }
}
