import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { CardField } from "@amax/core";
import { createRegistry } from "@amax/mcp";
import allocations from "../module";
import { addCard } from "../server/add-card";
import { allocationsDatabase, T } from "./setup";

const standingOf = (fields: CardField[] | undefined) => fields?.find((f) => f.name === "standing")?.value;

describe.skipIf(!hasDb)("109 the Add to project card keeps a month or a range (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  const registry = createRegistry([allocations]);
  beforeAll(async () => {
    db = await allocationsDatabase();
    await db.t.owner`insert into delivery.project (tenant_id, key, name, client, billing, manager_user_id) select ${T}, 'INT', 'Internal tools', 'Internal', 'internal', id from auth.user where email = 'maya@lumenlabs.test'`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  it.each([
    ["no month: until further notice", {}, "true"],
    ["one month: this month", { month: "2027-03" }, "false"],
    ["a range: this month", { month: "2027-03", through: "2027-05" }, "false"],
  ])("AC3 on an internal project, %s", async (_name, input, expected) => {
    expect(standingOf((await addCard(await db.as("maya"), { projectKey: "INT", ...input })).form?.fields)).toBe(expected);
  });

  it.each([
    ["as drafted", { through: "2027-05", percent: 40 }, "Added Dinesh Wickrama to INT · 40% Mar–May"],
    ["Through edited later", { through: "2027-07", percent: 40 }, "Added Dinesh Wickrama to INT · 40% Mar–Jul"],
    ["Through and Percent edited", { through: "2027-04", percent: 60 }, "Added Dinesh Wickrama to INT · 60% Mar–Apr"],
    ["final pass: Through into the next year names both years", { through: "2028-01", percent: 40 }, "Added Dinesh Wickrama to INT · 40% Mar 2027–Jan 2028"],
  ])("review round 2: worded again at confirm from the edited input, done names what is written: %s", async (_name, edits, done) => {
    const card = await addCard(await db.as("maya"), { projectKey: "INT", person: "Dinesh Wickrama", month: "2027-03", standing: false, ...edits });
    expect(card.look?.done).toBe(done);
  });

  it("AC4 a range shows Through and names it; until further notice with Through is refused next to Through", async () => {
    const maya = await db.as("maya");
    const card = await addCard(maya, { projectKey: "INT", person: "Dinesh Wickrama", month: "2027-03", through: "2027-05" });
    expect(card.form?.fields.map((f) => f.name)).toContain("through");
    expect([card.title, card.form?.confirm?.label]).toEqual(["Add Dinesh Wickrama to INT", "Add {person} to INT, {through}"]);
    const tool = registry.toolsFor(maya).find((t) => t.name === "allocate")!;
    await expect(tool.propose!(maya as never, { person: "Dinesh Wickrama", projectKey: "INT", month: "2027-03", through: "2027-05", standing: true } as never))
      .rejects.toMatchObject({ field: "through" });
    await expect(registry.call(maya, "allocate", { person: "Dinesh Wickrama", projectKey: "INT", month: "2027-03", through: "2027-05", percent: "40", standing: "false" }, { source: "mcp" }))
      .resolves.toMatchObject({ months: ["2027-03-01", "2027-04-01", "2027-05-01"] });
  });
});
