import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import { setGrants } from "@amax/auth";
import { registryFrom, runDueJobs } from "@amax/core/server";
import { createPostgresEngine, setWorkflowEngine, workflowRegistry } from "@amax/workflows/server";
import { createRegistry } from "@amax/mcp";
import manifest from "../module";
import { installedModules } from "./installed";
import { T, timeDb } from "./db";

// 070 amendment 3 tests: the time module with the outbox and notifications' engine, as in corrections-flow.
export async function requestsWorld() {
  const db = await timeDb();
  const modules = await installedModules();
  setGrants(modules);
  const engine = createPostgresEngine({ db: db.app, registry: workflowRegistry(modules) });
  setWorkflowEngine(async () => engine);
  await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
  const tick = async () => { for (let i = 0; i < 2; i++) { await runDueJobs(db.app, registryFrom(modules)); await engine.tick(); } };
  const registry = createRegistry([manifest]);
  type Entry = { id: string; day: string; hours: number; projectName: string; source: string };
  const entry = async (v: Viewer, project: string, day: string, source = "person") =>
    ((await registry.call(v, "get_timesheet", { week: "2026-W42", project }, { source: "chat" })) as { entries: Entry[] }).entries.find((e) => e.day === day && e.source === source)!;
  const bell = (v: Viewer, like: string) => db.q(sql`select title, body from notifications.notification where user_id = ${v.userId} and rule_id like ${like} order by created_at`);
  const status = async (id: string) => (await db.q(sql`select status from time.change_request where id = ${id}`))[0]?.status;
  return { db, tick, registry, entry, bell, status };
}
