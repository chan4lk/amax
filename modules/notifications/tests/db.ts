import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime, registryFrom, runDueJobs } from "@amax/core/server";
import { configureSecrets, localKms } from "@amax/core/secrets";
import { installAuthorizer, setGrants, setViewerScopeResolvers, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { createPostgresEngine, setWorkflowEngine, workflowRegistry } from "@amax/workflows/server";
import { loadFixtures, lumen } from "@amax/testing";
import type { ModuleManifest } from "@amax/core";
import { installedModules } from "./installed";

export const T = lumen.tenant.id;

/** Every installed module with its fixtures, the host's job registry and a Postgres workflow engine. */
export async function notificationsDb(extra: ModuleManifest[] = []) {
  const t = await migratedDatabase();
  const app = t.app();
  const modules = [...(await installedModules()), ...extra];
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  configureSecrets({ kms: localKms(new Uint8Array(randomBytes(32))) });
  setGrants(modules);
  setViewerScopeResolvers(modules.flatMap((m) => (m.viewerScopes ? [m.viewerScopes] : [])));
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, ...modules], lumen);
  // 088: Maya's fixture quiet hours (21:00 to 07:00 Colombo, 15:30 to 01:30 UTC) would hold her deliveries asleep on the
  // real clock, so a test run in that window never settles. Cleared for every test; channels.test checks quiet hours itself.
  await t.owner`delete from notifications.quiet_hours`;
  const engine = createPostgresEngine({ db: app, registry: workflowRegistry(modules) });
  setWorkflowEngine(async () => engine);
  const jobs = registryFrom(modules);
  const q = (query: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(query));
  const idOf = async (key: string) => (await q(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`))[0].id as string;
  const as = async (key: string): Promise<Viewer> => (await withTenant(app, T, async (tx) => viewerForUser(tx, T, await idOf(key))))!;
  // Delivers outbox events and drives runs (timers and retry backoff skipped) until nothing is left.
  async function drain() {
    for (let i = 0; i < 100; i++) {
      await t.owner`update workflows.run set wake_at = now() where status in ('running', 'sleeping') and wake_at > now()`;
      await t.owner`update core.event set locked_until = null where delivered_at is null`;
      const r = await runDueJobs(app, jobs);
      await engine.tick();
      const [{ n }] = await t.owner`select count(*)::int as n from workflows.run where status not in ('completed', 'failed', 'cancelled')`;
      if (n === 0 && r.events === 0 && r.eventsFailed === 0) return;
    }
    throw new Error("events or runs never settled");
  }
  const emit = (name: string, payload: object) => q(sql`insert into core.event (tenant_id, name, payload) values (${T}, ${name}, ${JSON.stringify(payload)}::jsonb)`);
  return { t, app, as, idOf, q, drain, emit, engine };
}
