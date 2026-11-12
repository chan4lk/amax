// Admin CLI for deployments without an identity provider. Runs as the schema owner.
//   pnpm --filter @amax/auth admin tenant-add "Lumen Labs"
//   pnpm --filter @amax/auth admin user-add --tenant <id> --email a@b.c --name "A B" --roles Admin,PM [--password ...]
//   pnpm --filter @amax/auth admin user-deactivate --tenant <id> --email a@b.c
//   pnpm --filter @amax/auth admin scim-token --tenant <id>
//   pnpm --filter @amax/auth admin principal-add --tenant <id> --email <owner> --name <name> --roles <scopes>
// Without --password a strong one is generated and printed once. user-deactivate and principal-add write to the
// audit chain, so they also need AUDIT_HASH_KEY (the app's value) and refuse a missing or different key. Every
// command checks the whole environment with core's loadEnv, as the app does at boot, so any invalid variable stops it.
import { randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { createDb, withTenant } from "@amax/db";
import { loadEnv } from "@amax/core/env";
import { configureRuntime, keyed } from "@amax/core/server";
import { upsertPasswordUser } from "../src/password";
import { revokeUser } from "../src/revoke";
import { createScimToken } from "../src/scim";
import { createPrincipal } from "../src/principals";
import { viewerForUser } from "../src/session";
import { isRole } from "../src/roles";

const env = loadEnv();
const url = env.DATABASE_MIGRATE_URL;
if (!url) throw new Error("set DATABASE_MIGRATE_URL (the schema owner)");
const [cmd, ...rest] = process.argv.slice(2);
const { values, positionals } = parseArgs({
  args: rest,
  allowPositionals: true,
  options: { tenant: { type: "string" }, email: { type: "string" }, name: { type: "string" }, roles: { type: "string" }, password: { type: "string" } },
});
const auditKey = env.AUDIT_HASH_KEY;
const audited = cmd === "principal-add" || cmd === "user-deactivate";
if (!auditKey && audited) throw new Error("set AUDIT_HASH_KEY (the deployment's audit key)");
const { db, client } = createDb(url, { max: 1 });
if (auditKey) configureRuntime({ db, auditKey });
const need = (k: keyof typeof values) => values[k] ?? (() => { throw new Error(`--${k} is required`); })();
// A wrong key would append rows no one can verify or erase, so it must reproduce the deployment's latest keyed actor.
async function deploymentKey() {
  const [r] = await db.execute(sql`select actor, actor_key from core.latest_keyed_actor()`);
  if (r && keyed(r.actor, auditKey) !== r.actor_key) throw new Error("AUDIT_HASH_KEY is not this deployment's key");
}

try {
  if (audited) await deploymentKey();
  if (cmd === "tenant-add") {
    const id = randomUUID();
    const name = positionals[0] ?? (() => { throw new Error("tenant name is required"); })();
    await withTenant(db, id, (tx) => tx.execute(sql`insert into core.tenant (id, name) values (${id}, ${name})`));
    console.log(`tenant ${id}  (set AMAX_AUTH_PASSWORD_TENANT=${id})`);
  } else if (cmd === "user-add") {
    const roles = need("roles").split(",").map((r) => r.trim());
    const bad = roles.filter((r) => !isRole(r));
    if (bad.length) throw new Error(`unknown roles: ${bad.join(", ")}`);
    const password = values.password ?? randomBytes(15).toString("base64url");
    const id = await upsertPasswordUser(db, need("tenant"), { email: need("email"), name: need("name"), roles: roles as never, password });
    console.log(`user ${id}${values.password ? "" : `  password: ${password}  (shown once)`}`);
  } else if (cmd === "user-deactivate") {
    const tenantId = need("tenant");
    const [u] = await withTenant(db, tenantId, (tx) => tx.execute(sql`select id from auth.user where email = ${need("email").toLowerCase()}`));
    if (!u) throw new Error("no such user");
    await revokeUser(db, tenantId, u.id as string, { deactivate: true, reason: "admin-cli" });
    console.log(`deactivated ${u.id}`);
  } else if (cmd === "principal-add") {
    // e.g. principal-add --tenant <id> --email <owner admin> --name specclaw-sync --roles delivery:proposal:sync
    const tenantId = need("tenant");
    const [u] = await withTenant(db, tenantId, (tx) => tx.execute(sql`select id from auth.user where email = ${need("email").toLowerCase()}`));
    if (!u) throw new Error("no such owner");
    const owner = await withTenant(db, tenantId, (tx) => viewerForUser(tx, tenantId, u.id as string));
    const { id, token } = await createPrincipal(db, owner!, { name: need("name"), scopes: need("roles").split(","), actsFor: [], days: 365 });
    console.log(`principal ${id}  token (shown once): ${token}`);
  } else if (cmd === "scim-token") {
    console.log(`SCIM token (shown once): ${await createScimToken(db, need("tenant"))}`);
  } else {
    console.error("commands: tenant-add <name> | user-add --tenant --email --name --roles [--password] | user-deactivate --tenant --email | scim-token --tenant | principal-add --tenant --email <owner> --name --roles <scopes>");
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
