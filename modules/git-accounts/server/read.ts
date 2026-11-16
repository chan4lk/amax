import { sql } from "drizzle-orm";
import { z } from "zod";
import { gitIdentitiesOf } from "@amax/auth/git-identity";
import type { Viewer } from "@amax/auth";
import { hasSecret } from "@amax/core/secrets";
import type { GitAccounts, GitHubLogin } from "../contracts";
import { read } from "./context";

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
export const githubAppStatus = (v: Viewer) => read(v, async (tx) => ({ connector: "github-oauth", configured: await hasSecret(tx, "github-oauth") }));

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
