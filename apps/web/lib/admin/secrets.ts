import { z } from "zod";
import { CONNECTOR_IDS, CONNECTORS, endOfDay, EXPIRY_DAY, EXPIRY_DAY_HINT, expiryDayProblem, ExpiryPassedError, keptExpiryOf, kmsLabel, listCredentials, putSecret, REVOKE_REASONS, revokeSecret, unavailableWords, type CredentialRow } from "@amax/core/secrets";
import { ToolError } from "@amax/mcp";
import type { Viewer } from "@amax/auth";
import { filterCredentials, SECRET_FILTERS } from "./credentials";
import { ctxFor, notFound, read, tool, write } from "./tool";

const connector = z.enum(CONNECTOR_IDS).describe(`One of ${CONNECTOR_IDS.join(", ")}`);
const day = z.string().regex(EXPIRY_DAY).describe(EXPIRY_DAY_HINT);
const READ = "secrets:credential:read";
const MANAGE = "secrets:credential:manage";

const meta = (r: CredentialRow) => ({ ...r, name: CONNECTORS[r.connector].name, usedFor: CONNECTORS[r.connector].usedFor });
const rows = async (v: Viewer) => (await listCredentials(ctxFor(v, "chat"))).rows;
const current = async (v: Viewer, c: string) => (await rows(v)).find((r) => r.connector === c && r.status !== "revoked");

// The value only ever comes from the masked field on chat's confirm card (047 AC-4).
function typed(secret: string | undefined) {
  if (!secret) throw new ToolError("the value is typed into the masked field on amax chat's confirm card; it can't be sent as tool input", "invalid_input");
  return secret;
}

// 116 AC-2: the GitHub app (connector github-oauth) is set only with set_github_app, which checks its Client ID and secret.
const GITHUB_APP = "Use set_github_app: the GitHub app needs its Client ID and Client secret";
// Review round 3: a given expiry day is checked before anyone types the value, as the kept one is.
const guard = (connector: string, expiresAt: string | undefined) => {
  if (connector === "github-oauth") throw new ToolError(GITHUB_APP, "invalid_input");
  const problem = expiresAt ? expiryDayProblem(expiresAt) : null;
  if (problem) throw new ToolError(problem, "invalid_input", "expiresAt");
};
// 116 AC-6: with no key service nothing can be stored; say so instead of "I can't tell whether this was done".
const stored = <T>(p: Promise<T>) => p.catch((e: unknown) => {
  throw e instanceof Error && e.name === "SecretsUnavailableError" ? new ToolError(unavailableWords(e, kmsLabel()), "invalid_input") : e;
});

// "Keep its expiry" (052): the rule lives in @amax/core/secrets; here a past date is the tool's refusal.
export function keptExpiry(connector: string, expiresAt: Date | null, now = new Date()): string | null {
  try { return keptExpiryOf(connector, expiresAt, now); } catch (e) { throw e instanceof ExpiryPassedError ? new ToolError(e.message, "invalid_input") : e; }
}

export const secretTools = [
  tool({ ...read(READ), pin: "view", name: "list_secrets", description: "Connector credentials' status, expiry, rotation and last use. Never the values. filter: all (default), expiring (active, expiring within the warning window, not yet past it) or rotated (active, rotated in the last 90 days), as the Keys screen's tickets count them.",
    input: z.object({ filter: z.enum(SECRET_FILTERS).optional() }), run: async (v, a) => filterCredentials(await rows(v), a.filter ?? "all", new Date()).map(meta) }),
  tool({ ...read(READ), pin: "view", name: "get_secret_meta", description: "One connector credential's status, expiry, rotation and last use. Never the value.", input: z.object({ connector }),
    run: async (v, a) => { const r = (await rows(v)).find((x) => x.connector === a.connector); if (!r) throw notFound(`credential ${a.connector}`); return meta(r); } }),
  tool({ ...write(MANAGE), name: "put_secret", description: "Add a connector credential. The person types the value on the confirm card.", secretInput: { label: "Value" },
    input: z.object({ connector, expiresAt: day.optional() }), service: putSecret, propose: async (_v, a) => guard(a.connector, a.expiresAt),
    run: async (v, a, s, secret) => {
      guard(a.connector, a.expiresAt);
      if (await current(v, a.connector)) throw new ToolError(`${a.connector} already has a credential; use rotate_secret`, "invalid_input");
      return stored(putSecret(ctxFor(v, s), { connector: a.connector, value: typed(secret), expiresAt: endOfDay(a.expiresAt) ?? null }));
    } }),
  tool({ ...write(MANAGE), name: "rotate_secret", description: "Rotate a connector credential to a new value, keeping its expiry unless a new one is given. The person types the value on the confirm card.",
    secretInput: { label: "New value" }, service: putSecret,
    input: z.object({ connector, expiresAt: day.optional(), graceHours: z.number().int().min(0).max(720).optional().describe("How long the old value keeps working; default 72") }),
    // Checked when chat proposes the card, so a past expiry is refused before anyone types the value (053).
    propose: async (v, a) => {
      guard(a.connector, a.expiresAt);
      const row = await current(v, a.connector);
      if (row && !a.expiresAt) keptExpiry(a.connector, row.expiresAt);
    },
    run: async (v, a, s, secret) => {
      guard(a.connector, a.expiresAt);
      const row = await current(v, a.connector);
      if (!row) throw new ToolError(`${a.connector} has no credential to rotate; use put_secret`, "invalid_input");
      return stored(putSecret(ctxFor(v, s), { connector: a.connector, value: typed(secret), expiresAt: endOfDay(a.expiresAt) ?? keptExpiry(a.connector, row.expiresAt), graceHours: a.graceHours ?? 72 }));
    } }),
  tool({ ...write(MANAGE), name: "revoke_secret", description: "Revoke a connector credential now; its stored value is destroyed.", destructive: true,
    input: z.object({ connector, reason: z.enum(REVOKE_REASONS) }), service: revokeSecret, run: (v, a, s) => revokeSecret(ctxFor(v, s), a) }),
];
