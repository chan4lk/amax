import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import { installedModules } from "./installed";
import { notificationsDb } from "./db";

// 081 amendment 7 (AC-76): real Delivery writes, through the MCP tools as Maya, all the way to Nimal's bell. The other
// routing tests start from hand-made events; this one proves the services raise what the rules read.
describe.skipIf(!hasDb)("081 a proposal's owner hears every step of its life from real writes (Postgres)", () => {
  let db: Awaited<ReturnType<typeof notificationsDb>>;
  let registry: ReturnType<typeof createRegistry>;
  beforeAll(async () => {
    db = await notificationsDb();
    registry = createRegistry(await installedModules());
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC76 create, moves, a task, a Prod deployment, its void and a withdrawal each reach the owner; the PM who acted hears nothing", async () => {
    const [maya, nimal] = await Promise.all([db.as("maya"), db.as("nimal")]);
    const call = (tool: string, input: Record<string, unknown>) => registry.call(maya, tool, input, { source: "mcp" }) as Promise<Record<string, unknown>>;
    const { key } = (await call("create_proposal", { projectKey: "CON", title: "Flow check", ownerUserId: nimal.userId })) as { key: string };
    await call("add_proposal_task", { key, title: "Do it" });
    for (const to of ["planned", "building"]) await call("move_proposal", { key, to });
    await call("mark_task_done", { key, task: "T1" });
    await call("move_proposal", { key, to: "verified" });
    await call("create_release", { projectKey: "CON", version: "v9.0.0", proposalKeys: [key] });
    await call("record_deployment", { projectKey: "CON", version: "v9.0.0", environment: "Prod" });
    await call("void_deployment", { projectKey: "CON", version: "v9.0.0", environment: "Prod", reason: "Flow check" });
    const { key: other } = (await call("create_proposal", { projectKey: "CON", title: "Flow check withdrawn", ownerUserId: nimal.userId })) as { key: string };
    await call("withdraw_proposal", { key: other, reason: "Client dropped it" });
    await db.drain();

    const bell = async (who: string, like: string) => (await db.q(sql`select title from notifications.notification where user_id = ${await db.idOf(who)} and title like ${like} order by created_at, title`)).map((n) => n.title as string);
    expect(await bell("nimal", `%${key}%`)).toEqual(expect.arrayContaining([
      `You now own ${key}: Flow check`,
      `${key} moved from proposed to planned`, `${key} moved from planned to building`, `Task T1 of ${key} is done`,
      `${key} moved from building to verified`, `${key} moved from verified to released`, `${key} moved from released to verified`,
    ]));
    expect(await bell("nimal", `%${key}%`)).toHaveLength(7);
    // One drain delivers both at once, so they're compared as a set, not in order.
    expect((await bell("nimal", `%${other}%`)).sort()).toEqual([`${other} was withdrawn: Client dropped it`, `You now own ${other}: Flow check withdrawn`]);
    expect(await bell("maya", `%${key}%`)).toEqual([]);
  }, 180_000);
});
