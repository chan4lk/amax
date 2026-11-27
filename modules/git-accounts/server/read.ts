import { sql } from "drizzle-orm";
import { z } from "zod";
import { gitIdentitiesOf } from "@amax/auth/git-identity";
import type { Viewer } from "@amax/auth";
import { can } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { contextFor } from "@amax/core/server";
import { hasSecret } from "@amax/core/secrets";
import type { GitAccounts, GitHubLogin } from "../contracts";
import { appRow, appUsable } from "./app";
import { read } from "./context";
import { redirectUri } from "./github";

/**
 * 108 AC-6: the viewer's Git accounts: whether GitHub is set up here, and each GitHub login they hold with its verified
 * emails (review round 1: several logins, or a login with no email, linked earlier through a delivery suggestion).
 */
export const myGitAccounts = (v: Viewer) => read(v, async (tx): Promise<GitAccounts> => {
  const logins = new Map<string, GitHubLogin>();
  for (const g of (await gitIdentitiesOf(tx, v.userId)).filter((x) => x.provider === "github")) {
    const l = logins.get(g.login) ?? { login: g.login, emails: [] };
    if (g.email) l.emails.push({ id: g.id, email: g.email, verified: g.emailVerified });
    logins.set(g.login, l);
  }
  return { configured: await hasSecret(tx, "github-oauth"), github: logins.size ? { logins: [...logins.values()] } : null };
});

/** 108 AC-1 (review round 2): whether this workspace has the GitHub app, as one record whether or not it is set up. */
export const githubAppStatus = async (v: Viewer) => {
  const configured = await read(v, (tx) => hasSecret(tx, "github-oauth"));
  // 116 AC-4 (review round 1): the same row the card reads, for those who manage credentials: when it was set or last
  // rotated, and whether a credential that's no longer usable has expired. The callback URL GitHub must have, or why not.
  // 119 (review round 1): the row is read as the check reads (a job acting for the viewer), so everyone sees "expired"
  // and every process keys its check on the same version; when it was rotated stays for those who manage credentials.
  const job = contextFor.job(v.tenantId, "git-accounts.app-check", `user:${v.userId}`);
  const row = await appRow(job);
  const callback = (() => { try { return { callbackUrl: redirectUri(), callbackProblem: null }; } catch (e) { if (e instanceof ToolError) return { callbackUrl: null, callbackProblem: e.message }; throw e; } })();
  // 117 AC-3 (review round 3, escalated): one state every consumer switches on, never a yes/no to lean on.
  const { state, checkProblem } = await stateOf(job, configured, row);
  return { connector: "github-oauth", state, checkProblem, rotatedAt: can(v, "secrets:credential:read") ? row?.lastRotatedAt ?? null : null, ...callback };
};

/** The GitHub app's state: none, expired, incomplete (the value doesn't parse), unchecked (it couldn't be read, and why)
 * or ready. 119 AC-1: checked for everyone, as the connect reads it (a job acting for the viewer). */
export type AppState = "none" | "expired" | "incomplete" | "unchecked" | "ready";
async function stateOf(job: ReturnType<typeof contextFor.job>, exists: boolean, row: Awaited<ReturnType<typeof appRow>>): Promise<{ state: AppState; checkProblem: string | null }> {
  if (!exists) return { state: row?.status === "expired" ? "expired" : "none", checkProblem: null };
  const check = await appUsable(job, row?.lastRotatedAt ?? null);
  if (check.usable === null) return { state: "unchecked", checkProblem: check.problem };
  return { state: check.usable ? "ready" : "incomplete", checkProblem: null };
}

/** What Disconnect removes: every GitHub login and every row under it, in words. */
export const disconnectWhat = (g: NonNullable<GitAccounts["github"]>) => {
  const emails = g.logins.reduce((n, l) => n + l.emails.length, 0);
  return `${g.logins.map((l) => `@${l.login}`).join(", ")} and ${emails} email${emails === 1 ? "" : "s"}`;
};

/** 112 AC-2: one return's result, by the record the callback named: the viewer's own, from the last 10 minutes. */
export const returnResult = (v: Viewer, ref: string) => read(v, async (tx) => {
  if (!z.uuid().safeParse(ref).success) return null;
  const [r] = await tx.execute(sql`select result, skipped from git_accounts.connect_state where id = ${ref} and user_id = ${v.userId}
    and result is not null and result_at > now() - interval '10 minutes'`);
  return r ? { result: String(r.result), skipped: Number(r.skipped) } : null;
});

/** One of the viewer's own identities, for its pin. */
export const myIdentity = async (v: Viewer, id: string) => {
  for (const l of (await myGitAccounts(v)).github?.logins ?? []) {
    const e = l.emails.find((x) => x.id === id);
    if (e) return { id: e.id, login: l.login, email: e.email, verified: e.verified };
  }
  return null;
};
