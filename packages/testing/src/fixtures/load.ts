import { sql } from "drizzle-orm";
import { withTenant, type Db } from "@amax/db";
import type { ModuleManifest, SharedFixtures } from "@amax/core";
import { lumen } from "./shared";

type Seedable = Pick<ModuleManifest, "id" | "dependsOn" | "fixtures">;

// Seeds the shared tenant and its legal entities, then each module's fixtures in dependency order,
// all as the app role so fixtures pass the same RLS checks as real writes. Safe to re-run.
export async function loadFixtures(db: Db, modules: Seedable[], shared: SharedFixtures = lumen) {
  const tenantId = shared.tenant.id;
  await withTenant(db, tenantId, async (tx) => {
    await tx.execute(sql`insert into core.tenant (id, name) values (${tenantId}, ${shared.tenant.name}) on conflict do nothing`);
    for (const e of shared.entities) {
      await tx.execute(sql`insert into core.legal_entity (id, tenant_id, name, country, base_currency)
        values (${e.id}, ${tenantId}, ${e.name}, ${e.country}, ${e.baseCurrency}) on conflict do nothing`);
      if (e.timezone) await tx.execute(sql`insert into workflows.entity_zone (legal_entity_id, tenant_id, timezone) values (${e.id}, ${tenantId}, ${e.timezone}) on conflict do nothing`);
    }
  });
  const seeded: string[] = [];
  const byId = new Map(modules.map((m) => [m.id, m]));
  const visit = async (m: Seedable) => {
    if (seeded.includes(m.id)) return;
    seeded.push(m.id);
    for (const dep of m.dependsOn ?? []) if (byId.has(dep)) await visit(byId.get(dep)!);
    for (const seed of m.fixtures ?? []) await withTenant(db, tenantId, (tx) => seed({ tx, tenantId, shared }));
  };
  for (const m of modules) await visit(m);
  return { tenantId, modules: seeded };
}
