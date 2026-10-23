import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { signInPassword, upsertPasswordUser } from "../src/password";
import { endSwitchedSession, loadViewer } from "../src/session";

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
});
