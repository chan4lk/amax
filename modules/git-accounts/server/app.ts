import { ToolError } from "@amax/mcp";
import { keptExpiryOf, kmsLabel, listCredentials, putSecret, unavailableWords, useSecret } from "@amax/core/secrets";
import type { ServiceContext } from "@amax/core/server";
import { APP_INCOMPLETE, NOT_SET_UP } from "../words";

// 116: the GitHub app's credential, "<client id>:<client secret>" (connector github-oauth), written only by set_github_app.
// Errors raised inside a secret's use are rebuilt by its scrub, so they are named there and turned into refusals here.
const REFUSALS: Record<string, (e: Error) => string> = {
  SecretNotConfiguredError: () => NOT_SET_UP, GitHubAppIncomplete: () => APP_INCOMPLETE, SecretsUnavailableError: (e) => unavailableWords(e, kmsLabel()), ExpiryPassedError: (e) => e.message,
};
export const asRefusal = (e: unknown): never => {
  if (e instanceof Error && Object.hasOwn(REFUSALS, e.name)) throw new ToolError(REFUSALS[e.name](e), "invalid_input");
  throw e;
};

const incomplete = () => Object.assign(new Error("incomplete"), { name: "GitHubAppIncomplete" });

// 117 AC-3: the one rule for a usable "<client id>:<client secret>", for the writer, the reader and the status.
const CLIENT_ID = /^[^\s<>:]{4,100}$/;
const usableSecret = (s: string) => s.length >= 20 && !/[\s:]/.test(s);
export function parseGitHubApp(value: string): { id: string; secret: string } | null {
  const at = value.indexOf(":");
  const [id, secret] = [value.slice(0, at), value.slice(at + 1)];
  return at > 0 && CLIENT_ID.test(id) && usableSecret(secret) ? { id, secret } : null;
}

/** The app's client id and secret, or the clear refusal when the stored value isn't usable. */
export const app = (ctx: ServiceContext, purpose: string) => <T>(fn: (id: string, secret: string) => Promise<T>) =>
  useSecret(ctx, { connector: "github-oauth", purpose }, (s) => {
    const parsed = parseGitHubApp(s.reveal());
    if (!parsed) throw incomplete();
    return fn(parsed.id, parsed.secret);
  }).catch((e: unknown) => { forgetAppCheck(ctx.tenantId); return asRefusal(e); });

// 117 AC-3, 119 AC-3: usable, unusable, or null when it couldn't be read (never "unusable", never kept). An audited read:
// an answer is kept per tenant and credential version (from the database, so every process sees a new app at once) for
// at most CHECK_MS, shared by concurrent checks, and dropped in this process when a use fails.
export type AppCheck = { usable: boolean } | { usable: null; problem: string };
let CHECK_MS = 10 * 60_000; export const setAppCheckMs = (ms: number) => { CHECK_MS = ms; };
const checks = new Map<string, { at: number; version: string; answer: Promise<AppCheck> }>();
export const forgetAppCheck = (tenantId: string) => checks.delete(tenantId);
export const problemOf = (e: unknown) => { try { return asRefusal(e); } catch (r) { return r instanceof ToolError ? r.message : "amax couldn't read the GitHub app's credential just now"; } };
export function appUsable(ctx: ServiceContext, rotatedAt: Date | null): Promise<AppCheck> {
  const version = rotatedAt?.toISOString() ?? "";
  const held = checks.get(ctx.tenantId);
  if (held && held.version === version && Date.now() - held.at < CHECK_MS) return held.answer;
  const answer: Promise<AppCheck> = useSecret(ctx, { connector: "github-oauth", purpose: "GitHub app check" }, async (s) => parseGitHubApp(s.reveal()) !== null)
    .then((usable) => ({ usable }), (e: unknown) => {
      if (checks.get(ctx.tenantId)?.answer === answer) checks.delete(ctx.tenantId);
      return { usable: null, problem: problemOf(e) };
    });
  checks.set(ctx.tenantId, { at: Date.now(), version, answer });
  return answer;
}

/** The app's client id, read before any write: it isn't secret, but it lives in the credential. */
export const clientIdOf = (ctx: ServiceContext) => app(ctx, "GitHub connect link")(async (id) => id);

/** AC-1: a client id as GitHub shows it, never a placeholder; a secret of one piece. */
export function checkClientId(id: string) {
  if (!CLIENT_ID.test(id)) throw new ToolError("the Client ID is the one GitHub shows on the app's page, without spaces, <, > or :", "invalid_input", "clientId");
}
export function checkClientSecret(secret: string | undefined) {
  if (!secret || !usableSecret(secret)) throw new ToolError("the Client secret is the 40-character value GitHub generates, without spaces or :", "invalid_input");
  return secret;
}

/** Review round 1: the one lookup of the app's credential row, for those who manage credentials; revoked counts as none. */
export const appRow = async (ctx: ServiceContext) =>
  (await listCredentials(ctx).catch(asRefusal)).rows.find((r) => r.connector === "github-oauth" && r.status !== "revoked") ?? null;

/** AC-1: adds the app, or replaces it keeping its expiry by the 052 rule unless a new one is given. */
export async function storeGitHubApp(ctx: ServiceContext, input: { clientId: string; secret: string; expiresAt?: string }) {
  const row = await appRow(ctx);
  const expiresAt = input.expiresAt ?? (row ? (() => { try { return keptExpiryOf("github-oauth", row.expiresAt); } catch (e) { return asRefusal(e); } })() : null);
  return putSecret(ctx, { connector: "github-oauth", value: `${input.clientId}:${input.secret}`, expiresAt, ...(row ? { graceHours: 72 } : {}) })
    .catch(asRefusal).finally(() => forgetAppCheck(ctx.tenantId));
}
