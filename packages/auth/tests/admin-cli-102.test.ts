import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant, type Db } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { verifyAuditChain } from "@amax/core/server";

const KEY = "k".repeat(32);
const WRONG = "w".repeat(32);
const pkg = join(__dirname, "..");
const BUDGET = 60_000;

describe.skipIf(!hasDb)("102 admin CLI audit key", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  let app: Db;
  let tenant: string;

  const run = (args: string[], key: string | null = KEY) => {
    const env = { ...process.env, DATABASE_MIGRATE_URL: t.url, AUDIT_HASH_KEY: key ?? undefined };
    if (key === null) delete env.AUDIT_HASH_KEY;
    return spawnSync(process.execPath, ["--import", "tsx", "bin/admin.ts", ...args], { cwd: pkg, env, encoding: "utf8", timeout: BUDGET });
  };
  const seed = () => {
    const id = run(["tenant-add", "Lumen Labs"], null).stdout.match(/tenant (\S+)/)![1];
    for (const [email, roles] of [["maya@lumen.test", "Admin,PM"], ["kasun@lumen.test", "Engineer"]])
      expect(run(["user-add", "--tenant", id, "--email", email, "--name", email, "--roles", roles], null).status).toBe(0);
    return id;
  };
  const audit = (id = tenant) => withTenant(app, id, (tx) => tx.execute(sql`select action from core.audit_event where tenant_id = ${id} order by seq`));
  const chain = (id = tenant) => withTenant(app, id, (tx) => verifyAuditChain(tx, id, KEY));
  const audited = (id = tenant) => [["principal-add", "--tenant", id, "--email", "maya@lumen.test", "--name", "x", "--roles", "delivery:proposal:sync"], ["user-deactivate", "--tenant", id, "--email", "maya@lumen.test"]];

  beforeAll(async () => {
    t = await migratedDatabase();
    app = t.app();
    tenant = seed();
  }, 4 * BUDGET);
  afterAll(() => t?.drop());

  it("AC-1 principal-add creates the principal, prints its token once and audits it on the chain", async () => {
    const r = run(["principal-add", "--tenant", tenant, "--email", "maya@lumen.test", "--name", "specclaw-sync", "--roles", "delivery:proposal:sync"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^principal \S+ {2}token \(shown once\): \S+\s*$/);
    expect((await audit()).map((a) => a.action)).toContain("auth.principal.create");
    expect(await chain()).toMatchObject({ ok: true });
  }, BUDGET);

  it("AC-2 user-deactivate deactivates the user and audits it", async () => {
    const before = (await audit()).length;
    expect(run(["user-deactivate", "--tenant", tenant, "--email", "kasun@lumen.test"]).status).toBe(0);
    const [u] = await withTenant(app, tenant, (tx) => tx.execute(sql`select status from auth.user where email = 'kasun@lumen.test'`));
    expect(u.status).toBe("deactivated");
    expect((await audit()).length).toBeGreaterThan(before);
    expect(await chain()).toMatchObject({ ok: true });
  }, BUDGET);

  it.each([
    [null, "set AUDIT_HASH_KEY (the deployment's audit key)", true, false],
    ["", "AUDIT_HASH_KEY: at least 32 characters", false, false],
    ["short-key", "AUDIT_HASH_KEY: at least 32 characters", false, false],
    [WRONG, "AUDIT_HASH_KEY is not this deployment's key", true, false],
    [WRONG, "AUDIT_HASH_KEY is not this deployment's key", true, true],
  ])("AC-3 key %j: audited commands refuse with %j and write nothing; scim-token runs: %s; new tenant: %s", async (key, message, othersRun, fresh) => {
    const id = fresh ? seed() : tenant;
    const before = (await audit(id)).length;
    for (const args of audited(id)) {
      const r = run(args, key);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain(message);
    }
    expect((await audit(id)).length).toBe(before);
    expect(await chain(id)).toMatchObject({ ok: true });
    expect(run(["scim-token", "--tenant", id], key).status === 0).toBe(othersRun);
  }, 5 * BUDGET);

  it("AC-4 each command exits on its own", () => {
    for (const args of [...audited(), ["scim-token", "--tenant", tenant]]) { const r = run(args); expect([r.error, r.signal]).toEqual([undefined, null]); }
  }, 3 * BUDGET);
});
