import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";

// 008 AC-2: the Git logins and emails a person commits as (auth.git_identity). A commit is attributed
// to its person only when the provider verified it or the email is verified for this identity.
export type GitProvider = "github" | "azure-devops";
export type GitIdentity = { id: string; userId: string; provider: GitProvider; login: string; email: string | null; emailVerified: boolean; providerUserId: string | null };

const identity = (r: Record<string, unknown>): GitIdentity => ({
  id: r.id as string, userId: r.user_id as string, provider: r.provider as GitProvider, login: r.login as string, email: (r.email as string | null) ?? null, emailVerified: Boolean(r.email_verified), providerUserId: (r.provider_user_id as string | null) ?? null,
});

/** The identity a commit names: by login first, else by email. */
export async function findGitIdentity(tx: Tx, provider: GitProvider, who: { login: string | null; email: string | null }) {
  const [r] = await tx.execute(sql`select * from auth.git_identity where provider = ${provider}
    and (lower(login) = lower(${who.login ?? ""}) or (${who.email ?? ""} <> '' and lower(email) = lower(${who.email ?? ""})))
    order by (lower(login) = lower(${who.login ?? ""})) desc limit 1`);
  return r ? identity(r) : null;
}

/** An active person whose work email is this one: the candidate to link an unknown author to. */
export async function personByEmail(tx: Tx, email: string | null) {
  if (!email) return null;
  const [r] = await tx.execute(sql`select id, name from auth.user where lower(email) = lower(${email}) and status = 'active'`);
  return r ? { id: r.id as string, name: r.name as string } : null;
}

/**
 * 108 review round 2: a login is one person's. No index can say so (one login holds several emails), so every writer
 * that links a login takes this lock first, then checks: two people linking one login at once go one after the other.
 */
const lockLogin = (tx: Tx, tenantId: string, provider: GitProvider, login: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`auth.git_identity:${tenantId}:${provider}:${login.toLowerCase()}`}))`);

/** Links a login to a person, its email verified because a person approved the link. A login or email that is already
 * linked (108: one login may hold several emails, each email one person's) is refused. */
export async function linkGitIdentity(tx: Tx, tenantId: string, g: { provider: GitProvider; login: string; email: string | null; userId: string }) {
  await lockLogin(tx, tenantId, g.provider, g.login);
  const [taken] = await tx.execute(sql`select 1 from auth.git_identity where provider = ${g.provider}
    and (lower(login) = lower(${g.login}) or (${g.email ?? ""} <> '' and lower(email) = lower(${g.email ?? ""}))) limit 1`);
  const [r] = taken ? [] : await tx.execute(sql`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified)
    values (${tenantId}, ${g.userId}, ${g.provider}, ${g.login}, ${g.email}, ${g.email !== null}) on conflict do nothing returning *`);
  if (!r) throw Object.assign(new Error(`${g.provider} login ${g.login} is already linked`), { retryable: false, code: "invalid_input" });
  return identity(r);
}

export type GitHubLinkResult = { login: string; linked: string[]; removed: string[]; skipped: string[] };

/** Values as a SQL list for `in (...)`, each its own parameter; an empty list matches nothing. */
const anyOf = (column: ReturnType<typeof sql>, values: string[]) => (values.length ? sql`${column} in (${sql.join(values.map((v) => sql`${v}`), sql`, `)})` : sql`false`);

/**
 * 108 AC-3–AC-5: a person's GitHub login and the emails GitHub verified, stored as their verified identities. A connect
 * again replaces the set: emails GitHub no longer lists go. A login or email linked to someone else is never taken over:
 * it is skipped and named, and the rest are linked (a login of someone else's skips every email). Review round 1: what is
 * reported linked is what was written, so an email another writer took a moment earlier reads as skipped.
 */
export async function setGitHubIdentities(tx: Tx, tenantId: string, userId: string, gh: { login: string; githubId: number; emails: string[] }): Promise<GitHubLinkResult> {
  const emails = [...new Set(gh.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const account = String(gh.githubId);
  await lockLogin(tx, tenantId, "github", gh.login);
  await lockLogin(tx, tenantId, "github", `#${account}`);
  // Final pass 2: the account is GitHub's id. Someone else holding this login (under another id, or none recorded) or
  // this account keeps it; the person's own rows under an old login of the same account are replaced below (a rename).
  const others = await tx.execute(sql`select lower(login) as login, lower(email) as email, provider_user_id from auth.git_identity where provider = 'github' and user_id <> ${userId}
    and (lower(login) = lower(${gh.login}) or provider_user_id = ${account} or ${anyOf(sql`lower(email)`, emails)})`);
  const loginTaken = others.some((o) => o.login === gh.login.toLowerCase() || o.provider_user_id === account);
  const takenEmails = new Set(others.map((o) => o.email as string | null).filter((e): e is string => Boolean(e)));
  const kept = loginTaken ? [] : emails.filter((e) => !takenEmails.has(e));
  const removed = await tx.execute(sql`delete from auth.git_identity where provider = 'github' and user_id = ${userId}
    and not (lower(login) = lower(${gh.login}) and ${anyOf(sql`lower(coalesce(email, ''))`, kept)}) returning email, login`);
  const linked: string[] = [];
  for (const e of kept) {
    const [own] = await tx.execute(sql`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified, provider_user_id)
      values (${tenantId}, ${userId}, 'github', ${gh.login}, ${e}, true, ${account}) on conflict do nothing returning email`);
    const [mine] = own ? [own] : await tx.execute(sql`update auth.git_identity set provider_user_id = ${account}, email_verified = true
      where provider = 'github' and user_id = ${userId} and lower(email) = ${e} returning email`);
    if (mine) linked.push(e);
  }
  const skipped = loginTaken ? [`@${gh.login}`] : emails.filter((e) => !linked.includes(e));
  return { login: gh.login, linked, removed: removed.map((r) => String(r.email ?? r.login)), skipped };
}

/** 112 AC-1: whether this email is one of the person's verified emails with the provider. */
export async function isVerifiedEmailOf(tx: Tx, userId: string, provider: GitProvider, email: string | null) {
  if (!email) return false;
  const [r] = await tx.execute(sql`select 1 from auth.git_identity where user_id = ${userId} and provider = ${provider} and email_verified and lower(email) = lower(${email}) limit 1`);
  return Boolean(r);
}

/** A person's own Git identities, newest login first. */
export const gitIdentitiesOf = async (tx: Tx, userId: string) =>
  (await tx.execute(sql`select * from auth.git_identity where user_id = ${userId} order by provider, login, email`)).map(identity);

/** One identity gone; what it was, or null when there was none. */
export const unlinkGitIdentity = async (tx: Tx, id: string) => {
  const [r] = await tx.execute(sql`delete from auth.git_identity where id = ${id} returning *`);
  return r ? identity(r) : null;
};

/** 108 AC-7: every identity a person has with a provider, gone; what they were. */
export const unlinkGitIdentitiesOf = async (tx: Tx, userId: string, provider: GitProvider) =>
  (await tx.execute(sql`delete from auth.git_identity where user_id = ${userId} and provider = ${provider} returning *`)).map(identity);
