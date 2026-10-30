import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { sql } from "drizzle-orm";
import type { SharedFixtures } from "@amax/core";
import { createDb, withTenant, type Db } from "@amax/db";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import { agentsFixtures } from "../lib/agents-fixtures";
import { privacyFixtures } from "../lib/privacy-fixtures";
import { backupFixtures } from "../lib/backup-fixtures";
import { privacySources } from "../lib/privacy-sources";

// Module manifests import their pages, and pages import CSS. Outside Next (tsx), stub CSS so the
// registry loads. Vitest transforms CSS itself and never reaches this hook.
registerHooks({ load: (url, ctx, next) => (url.endsWith(".css") ? { format: "module", source: "", shortCircuit: true } : next(url, ctx)) });

/** Auth's demo users first, then every installed module (the generated registry) with its own fixtures. */
export async function installedSeeds() {
  const { modules } = await import("../generated/modules");
  return [
    { id: "auth", dependsOn: [] as string[], fixtures: [authFixtures] },
    ...modules.map((m) => ({ id: m.id, dependsOn: ["auth", ...(m.dependsOn ?? [])], fixtures: m.fixtures ?? [] })),
    // 032: after every module, so the demo erasure request lists the person's records everywhere.
    // 006: after every module, so the demo suggestions name real people, projects and plans.
    { id: "suggestions", dependsOn: ["auth", ...modules.map((m) => m.id)], fixtures: [agentsFixtures] },
    { id: "privacy", dependsOn: ["auth", ...modules.map((m) => m.id)], fixtures: [privacyFixtures(privacySources(modules))] },
    // 034: the Backups and export screen's drill history and exports.
    { id: "backup", dependsOn: ["auth"], fixtures: [backupFixtures] },
  ];
}

/**
 * Seeds the demo data of every installed module into one tenant, in dependency order, as the app role
 * (RLS applies). Re-running adds no rows: every module's fixtures are idempotent.
 */
export async function seedInstalledModules(db: Db, tenant: SharedFixtures["tenant"] = lumen.tenant) {
  return loadFixtures(db, await installedSeeds(), { ...lumen, tenant });
}

// CLI: `pnpm --filter @amax/web seed:demo [--tenant <id>]` with DATABASE_URL (the app role).
// The tenant defaults to AMAX_AUTH_PASSWORD_TENANT, so a deployed demo seeds the tenant people sign in to;
// without either it is the fixtures' own Lumen Labs tenant.
/** True when this file is the script node was started with; a file URL against a path, so it holds on Windows too (074). */
export const isMain = (moduleUrl: string, argv1: string | undefined) => !!argv1 && moduleUrl === pathToFileURL(argv1).href;

if (isMain(import.meta.url, process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("seed:demo needs DATABASE_URL (the app role)");
  const flag = process.argv.indexOf("--tenant");
  const tenantId = (flag > 0 ? process.argv[flag + 1] : undefined) ?? process.env.AMAX_AUTH_PASSWORD_TENANT ?? lumen.tenant.id;
  const { db, client } = createDb(url, { max: 1 });
  try {
    const [row] = await withTenant(db, tenantId, (tx) => tx.execute(sql`select name from core.tenant where id = ${tenantId}`));
    const tenant = { id: tenantId, name: (row?.name as string | undefined) ?? lumen.tenant.name };
    const r = await seedInstalledModules(db, tenant);
    console.log(`seeded tenant ${tenantId} (${tenant.name}): ${r.modules.join(", ")}`);
  } finally {
    await client.end();
  }
}
