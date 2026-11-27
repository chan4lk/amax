import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import { installedModules } from "./installed";
import { notificationsDb } from "./db";

describe.skipIf(!hasDb)("127 the Off track notice (Postgres)", () => {
  let db: Awaited<ReturnType<typeof notificationsDb>>;
  let registry: ReturnType<typeof createRegistry>;
  beforeAll(async () => {
    db = await notificationsDb();
    registry = createRegistry(await installedModules());
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-2 AC-3 the project's PM hears once, with category, target and link; another project's release and an engineer hear nothing", async () => {
    const sahan = await db.as("sahan");
    const call = (tool: string, input: Record<string, unknown>) => registry.call(sahan, tool, input, { source: "mcp" });
    const late = { name: "Late release", category: "UAT", startDate: "2026-09-01", targetDate: "2026-09-30" };
    await call("create_release", { ...late, projectKey: "CON", version: "v9.7.0" });
    await call("create_release", { ...late, projectKey: "FLT", version: "v9.7.0" });
    await call("update_release", { projectKey: "CON", version: "v9.7.0", name: "Late release" });
    await db.drain();
    const bell = async (who: string) => db.q(sql`select title, body, href, urgency from notifications.notification
      where user_id = ${await db.idOf(who)} and rule_id = 'delivery.release-off-track' order by created_at`);
    expect(await bell("maya")).toEqual([{ title: "Late release is now Off track", body: "UAT release · target 30 Sept 2026 · no successful UAT deployment yet",
      href: "/delivery/releases/CON/v9.7.0", urgency: "urgent" }]);
    expect(await bell("nimal")).toEqual([]);
  }, 60_000);
});
