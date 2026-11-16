import { z } from "zod";
import { loadEnv } from "@amax/core/env";
import { useSecret } from "@amax/core/secrets";
import type { ServiceContext } from "@amax/core/server";
import { NOT_SET_UP } from "../words";

// 108: GitHub's OAuth app, the one place amax talks to GitHub for a person's accounts. Its client id and secret are one
// 031 credential (`github-oauth`, "<client id>:<client secret>"), never env; the URLs may point at a fake GitHub in tests.
export const SCOPES = "read:user user:email";
let timeoutMs = 10_000;
/** Tests shorten GitHub's timeout; the app keeps 10 seconds. */
export const setGitHubTimeout = (ms: number) => { timeoutMs = ms; };
const web = () => (loadEnv().AMAX_GITHUB_URL ?? "https://github.com").replace(/\/$/, "");
const api = () => (loadEnv().AMAX_GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");

/** Review round 1: GitHub returns to amax's public URL; without AMAX_BASE_URL in production, connect refuses (fail closed). */
export function redirectUri() {
  const env = loadEnv();
  if (!env.AMAX_BASE_URL && env.NODE_ENV === "production") throw Object.assign(new Error("amax's public URL (AMAX_BASE_URL) isn't set, so GitHub can't return here; an Admin sets it"), { retryable: false, code: "invalid_input" });
  return `${(env.AMAX_BASE_URL ?? `http://localhost:${env.PORT ?? 3000}`).replace(/\/$/, "")}/api/git/github/callback`;
}

/** The app credential, "<client id>:<client secret>"; the secret is everything after the first colon (final pass). */
const app = (ctx: ServiceContext, purpose: string) => <T>(fn: (id: string, secret: string) => Promise<T>) =>
  useSecret(ctx, { connector: "github-oauth", purpose }, (s) => {
    const value = s.reveal();
    const at = value.indexOf(":");
    const [id, secret] = at > 0 ? [value.slice(0, at), value.slice(at + 1)] : ["", ""];
    if (!id || !secret) throw new Error("the GitHub app credential isn't <client id>:<client secret>; an Admin sets it again");
    return fn(id, secret);
  }).catch((e: unknown) => {
    if (e instanceof Error && e.name === "SecretNotConfiguredError") throw Object.assign(new Error(NOT_SET_UP), { retryable: false, code: "invalid_input" });
    throw e;
  });

/** The app's client id, read before any write (final pass): it isn't secret, but it lives in the credential. */
export const clientIdOf = (ctx: ServiceContext) => app(ctx, "GitHub connect link")(async (id) => id);

/** GitHub's authorize page for this state: the person approves reading their login and verified emails. */
export const authorizeUrl = (clientId: string, state: string) =>
  `${web()}/login/oauth/authorize?${new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri(), scope: SCOPES, state, allow_signup: "false" })}`;

export type GitHubUser = { login: string; githubId: number; emails: string[] };

/** A GitHub reply that isn't what GitHub documents, or that GitHub refused: never read as data. Known by its name,
 * which the secret's error scrub keeps (it rebuilds the error object). */
export class GitHubReplyError extends Error { override name = "GitHubReplyError"; }
export const isGitHubReplyError = (e: unknown) => e instanceof Error && e.name === "GitHubReplyError";

const Token = z.object({ access_token: z.string().min(1) });
const User = z.object({ login: z.string().regex(/^[A-Za-z0-9-]{1,39}$/), id: z.number().int().positive() });
const Emails = z.array(z.object({ email: z.string().email(), verified: z.boolean() }));

/** Review round 1: each call to GitHub times out, and its reply must match its schema. */
async function call<T>(schema: z.ZodType<T>, what: string, url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }).catch(() => { throw new GitHubReplyError(`GitHub didn't answer for ${what}`); });
  if (!r.ok) throw new GitHubReplyError(`GitHub refused ${what}`);
  // Final pass: a list with a further page would be read short; a reconnect would then drop the emails it missed.
  if (/rel="next"/.test(r.headers.get("link") ?? "")) throw new GitHubReplyError(`GitHub has more of ${what} than amax reads at once`);
  const parsed = schema.safeParse(await r.json().catch(() => null));
  if (!parsed.success) throw new GitHubReplyError(`GitHub's reply for ${what} wasn't readable`);
  return parsed.data;
}

/** The code GitHub returned, exchanged for a token that reads the user and their verified emails, then dropped (AC-3). */
export const readGitHubUser = (ctx: ServiceContext, code: string) => app(ctx, "GitHub connect")(async (id, secret): Promise<GitHubUser> => {
  const t = await call(Token, "the sign-in", `${web()}/login/oauth/access_token`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, code, redirect_uri: redirectUri() }) });
  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${t.access_token}` };
  const user = await call(User, "your profile", `${api()}/user`, { headers });
  const emails = await call(Emails, "your emails", `${api()}/user/emails?per_page=100`, { headers });
  return { login: user.login, githubId: user.id, emails: emails.filter((e) => e.verified).map((e) => e.email) };
});
