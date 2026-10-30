import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { signInPassword, upsertPasswordUser } from "../src/password";
import { endSwitchedSession, loadViewer } from "../src/session";
import { encode } from "next-auth/jwt";
import { authConfig, earlierSession } from "../src/authjs";

const T = "cccccccc-0000-4000-8000-00000000070a";

describe.skipIf(!hasDb)("070 AC52 switching accounts in one browser ends the session it replaces (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    configureRuntime({ db: app, auditKey: "k".repeat(32) });
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Hosted')`;
    await upsertPasswordUser(app, T, { email: "tharushi@lumen.test", name: "Tharushi Wijesinghe", roles: ["Engineer"], password: "tharushi-password-1" });
    await upsertPasswordUser(app, T, { email: "maya@lumen.test", name: "Maya Fernando", roles: ["Admin"], password: "maya-password-123" });
  });
  afterAll(() => t?.drop());

  it("AC52 the replaced session stops working and is audited as a switch; the new one works; ending it twice changes nothing", async () => {
    const first = await signInPassword(app, T, "tharushi@lumen.test", "tharushi-password-1");
    await endSwitchedSession(app, T, first.sessionId);
    const second = await signInPassword(app, T, "maya@lumen.test", "maya-password-123");
    expect([await loadViewer(app, T, first.sessionId), (await loadViewer(app, T, second.sessionId))?.name]).toEqual([null, "Maya Fernando"]);
    await endSwitchedSession(app, T, first.sessionId);
    const audit = await withTenant(app, T, (tx) => tx.execute(sql`select action, after->>'reason' as reason from core.audit_event where action = 'auth.signout'`));
    expect(audit).toEqual([{ action: "auth.signout", reason: "switched" }]);
  });

  // Review rounds 1 to 4: the earlier session ends in the jwt callback as the new token is minted (success only, every
  // provider; the same step that puts the stamp in the token), read by the app's own reader from a real Auth.js cookie.
  // The e2e (modules/time/tests/e2e/session.time.spec.ts) drives the same path through the running app.
  const SECRET = "s".repeat(32);
  const cookie = async (name: string, s: { tenantId: string; userId: string; sessionId: string }, secret = SECRET) =>
    ({ [name]: await encode({ token: { ...s, checkedAt: Date.now() }, secret, salt: name }) });
  const chunked = async (name: string, s: { tenantId: string; userId: string; sessionId: string }) => {
    const whole = (await cookie(name, s))[name];
    return { [`${name}.0`]: whole.slice(0, 40), [`${name}.1`]: whole.slice(40) };
  };
  type Jar = Record<string, string>;
  it.each([
    ["a password sign-in, http cookie", "user", (b: Awaited<ReturnType<typeof signInPassword>>) => cookie("authjs.session-token", b), true],
    ["an Entra sign-in, https cookie", "account", (b: Awaited<ReturnType<typeof signInPassword>>) => cookie("__Secure-authjs.session-token", b), true],
    ["a cookie Auth.js split into chunks", "user", (b: Awaited<ReturnType<typeof signInPassword>>) => chunked("authjs.session-token", b), true],
    ["a cookie made with another secret", "user", (b: Awaited<ReturnType<typeof signInPassword>>) => cookie("authjs.session-token", b, "x".repeat(32)), false],
    ["the same session signing in again", "same", (b: Awaited<ReturnType<typeof signInPassword>>) => cookie("authjs.session-token", b), false],
    ["a browser with no earlier session", "user", async () => ({}), false],
  ] as const)("AC52 %s", async (_, how, jar, ends) => {
    const before = await signInPassword(app, T, "tharushi@lumen.test", "tharushi-password-1");
    const after = how === "same" ? before : await signInPassword(app, T, "maya@lumen.test", "maya-password-123");
    const cookies: Jar = await jar(before);
    const config = await authConfig({ db: app, secret: SECRET, replaced: () => earlierSession((n) => cookies[n], SECRET) });
    const message = how === "account" ? { user: { id: after.userId }, account: { provider: "entra-x", amax: after } } : { user: { id: after.userId, amax: after }, account: { provider: "password" } };
    const token = await config.callbacks!.jwt!({ token: {}, ...message, trigger: "signIn" } as never);
    expect(token).toMatchObject({ sessionId: after.sessionId });
    expect(await loadViewer(app, T, before.sessionId) === null).toBe(ends);
    expect(await loadViewer(app, T, after.sessionId)).not.toBeNull();
  });
});
