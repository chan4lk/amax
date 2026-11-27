import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { setGitHubIdentities } from "@amax/auth/git-identity";
import { viewerOf } from "@amax/auth";
import { withdrawSuggestions } from "@amax/agents/server";
import { contextFor, defineService, logError, type ServiceContext } from "@amax/core/server";
import { EVENTS } from "../contracts";
import { RESULTS, type ResultCode } from "../words";
import { CONNECT, selfOf } from "./context";
import { authorizeUrl, isGitHubCallbackError, isGitHubCredentialsError, isGitHubReplyError, readGitHubUser } from "./github";

const hash = (state: string) => createHash("sha256").update(state).digest("hex");
/** GitHub's app is used by the system, acting for the person who connects (rule 4). */
export const forPerson = (ctx: ServiceContext) => contextFor.job(ctx.tenantId, "git-accounts.connect", `user:${selfOf(ctx)}`);

/** Why a connect didn't happen: a result code from the one list (words.ts) the screen turns into fixed words. */
export const refuse = (message: string, reason?: ResultCode) => Object.assign(new Error(message), { retryable: false, code: "invalid_input", reason });

/**
 * 108 AC-1, AC-2: a single-use link to GitHub's authorize page for the viewer, good for 10 minutes. Only its hash is kept.
 * Final pass: the app's client id is read before this write, so the write holds one connection and only stores the state.
 */
export const issueConnect = defineService({
  name: "git-accounts.github.link", action: CONNECT, resource: "git_accounts.connect_state", input: z.object({ clientId: z.string().min(1) }),
  async run(tx, input, ctx) {
    const userId = selfOf(ctx);
    // 112: states are kept a day, so a late or repeated return still finds its record; older ones go.
    await tx.execute(sql`delete from git_accounts.connect_state where user_id = ${userId} and created_at < now() - interval '1 day'`);
    const state = randomBytes(24).toString("base64url");
    await tx.execute(sql`insert into git_accounts.connect_state (tenant_id, user_id, state_hash) values (${ctx.tenantId}, ${userId}, ${hash(state)})`);
    return { result: { open: { label: "Continue to GitHub", url: authorizeUrl(input.clientId, state) }, expiresInMinutes: 10 }, resourceId: userId, after: { issued: true } };
  },
});

/** 108 AC-2: GitHub's return claims the state, once: issued to this person, unused, under 10 minutes old. */
const claimConnect = defineService({
  name: "git-accounts.github.claim", action: CONNECT, resource: "git_accounts.connect_state", input: z.object({ state: z.string().min(16) }),
  async run(tx, input, ctx) {
    const [claim] = await tx.execute(sql`update git_accounts.connect_state set used_at = now() where state_hash = ${hash(input.state)} and user_id = ${selfOf(ctx)}
      and used_at is null and created_at > now() - interval '10 minutes' returning id`);
    if (!claim) throw refuse("That GitHub link has expired or was already used. Ask amax to connect GitHub again.", "expired");
    return { result: { claimId: claim.id as string }, resourceId: claim.id as string, after: { claimed: true } };
  },
});

/**
 * 108 AC-3: what GitHub said, stored once against the claim, in one audited write. Final pass: a connect that would link
 * nothing (no verified email, every email or the login someone else's) is refused and leaves what was there.
 */
const storeConnect = defineService({
  name: "git-accounts.github.connect", action: CONNECT, resource: "auth.git_identity",
  input: z.object({ claimId: z.uuid(), login: z.string().min(1), githubId: z.number().int().positive(), emails: z.array(z.string()) }),
  async run(tx, input, ctx) {
    const userId = selfOf(ctx);
    const [ok] = await tx.execute(sql`update git_accounts.connect_state set stored_at = now() where id = ${input.claimId} and user_id = ${userId}
      and used_at > now() - interval '10 minutes' and stored_at is null returning id`);
    if (!ok) throw refuse("That GitHub link has expired or was already used. Ask amax to connect GitHub again.", "expired");
    if (!input.emails.length) throw refuse("GitHub has no verified email for you: verify one on GitHub, then connect again.", "no-email");
    const r = await setGitHubIdentities(tx, ctx.tenantId, userId, input);
    if (r.skipped.includes(`@${input.login}`)) throw refuse(`@${input.login} is linked to another person; ask an Admin.`, "login-taken");
    if (!r.linked.length) throw refuse("Every verified email on your GitHub is linked to another person; ask an Admin.", "all-taken");
    const n = r.linked.length;
    await tx.execute(sql`update git_accounts.connect_state set result = 'connected', skipped = ${r.skipped.length}, result_at = now() where id = ${input.claimId}`);
    const summary = `${viewerOf(ctx)?.name ?? "Someone"} connected GitHub as @${input.login}: ${n} email${n === 1 ? "" : "s"}`;
    // 116 AC-7: the audit record keeps counts; the addresses stay in auth.git_identity, read only by their owner.
    return { result: { ...r, summary }, resourceId: userId, after: { summary, login: r.login, linked: n, removed: r.removed.length, skipped: r.skipped.length },
      events: [{ name: EVENTS.connected, payload: { userId, login: input.login, emails: n } }] };
  },
});

/** 112 AC-2: the code a failure comes to: its refusal's reason, a GitHub reply that wasn't readable, else an error. */
export const resultCodeOf = (e: unknown): ResultCode => {
  const reason = (e as { reason?: unknown } | null)?.reason;
  if (typeof reason === "string" && Object.hasOwn(RESULTS, reason)) return reason as ResultCode;
  if (isGitHubCallbackError(e)) return "callback";
  if (isGitHubCredentialsError(e)) return "credentials";
  return isGitHubReplyError(e) ? "github" : "error";
};

/**
 * 112 AC-2 (final pass 3): only a return that holds its state's claim decides its result, so a duplicate return never
 * locks in the wrong one. A failure after the claim is written by its claim's id; a return that never claimed (declined,
 * incomplete, or a state too old to claim) writes only while nobody holds the claim, and otherwise only reads. Either
 * way the row's id goes back to the screen; none when no such state is this person's.
 */
export const recordReturn = defineService({
  name: "git-accounts.github.result", action: CONNECT, resource: "git_accounts.connect_state",
  input: z.object({ state: z.string(), result: z.enum(Object.keys(RESULTS) as [ResultCode, ...ResultCode[]]).exclude(["connected"]), claimId: z.uuid().optional() }),
  async run(tx, input, ctx) {
    const mine = sql`state_hash = ${hash(input.state)} and user_id = ${selfOf(ctx)}`;
    if (input.claimId) await tx.execute(sql`update git_accounts.connect_state set result = ${input.result}, skipped = 0, result_at = now() where id = ${input.claimId} and ${mine} and stored_at is null`);
    else await tx.execute(sql`update git_accounts.connect_state set result = ${input.result}, skipped = 0, result_at = now() where ${mine} and used_at is null and result is null`);
    const [row] = await tx.execute(sql`select id from git_accounts.connect_state where ${mine}`);
    const id = (row?.id as string | undefined) ?? null;
    return { result: { id }, resourceId: id, after: { result: input.result } };
  },
});

/**
 * 108 AC-2, AC-3, AC-10: GitHub's return, end to end. Each write is short and no call to GitHub runs inside one (review
 * round 1): claim the state, read GitHub, store; then open suggestions to link that login are withdrawn, for the person.
 */
export async function completeConnect(ctx: ServiceContext, input: { state: string; code: string }) {
  const { claimId } = await claimConnect(ctx, { state: input.state });
  // Final pass 3: a failure after the claim carries the claim, so only this return writes its result.
  const held = <T>(p: Promise<T>) => p.catch((e: unknown) => { throw Object.assign(e instanceof Error ? e : new Error(String(e)), { claimId }); });
  const gh = await held(readGitHubUser(forPerson(ctx), input.code));
  const r = await held(storeConnect(ctx, { claimId, login: gh.login, githubId: gh.githubId, emails: gh.emails }));
  // Review round 2: the identities are stored; a suggestion left open is logged, never reported as a failed connect.
  await withdrawSuggestions(forPerson(ctx), { kind: "delivery.git-identity", targetType: "auth.git_identity", targetIds: [`github:${gh.login}`], reason: `${gh.login} connected GitHub themselves` })
    .catch((e: unknown) => logError("git-accounts.withdraw", e));
  return { ...r, claimId };
}
