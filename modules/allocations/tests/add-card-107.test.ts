import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import type { CardField } from "@amax/core";
import allocations from "../module";
import { addCard, freeLabel } from "../server/add-card";
import { allocationsDatabase, T } from "./setup";

const field = (fields: CardField[] | undefined, name: string) => fields?.find((f) => f.name === name);
const chips = (f: CardField | undefined) => (f?.kind === "chips" ? f.options.map((o) => o.label) : []);

describe.skipIf(!hasDb)("107 the Add to project card (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  const registry = createRegistry([allocations]);
  beforeAll(async () => {
    db = await allocationsDatabase();
    await db.t.owner`insert into delivery.project (tenant_id, key, name, client, billing, manager_user_id) select ${T}, 'INT', 'Internal tools', 'Internal', 'internal', id from auth.user where email = 'maya@lumenlabs.test'`;
  }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC7 up to four people not on it this month, most free first, then a percent and how long; internal projects default to 100% until further notice", async () => {
    const maya = await db.as("maya");
    const con = await addCard(maya, { projectKey: "CON" });
    const people = chips(field(con.form?.fields, "person"));
    expect(people.length).toBeGreaterThan(0);
    expect(people.length).toBeLessThanOrEqual(4);
    for (const label of people) expect(label).toMatch(/^.+ · .+( · (\d+% free this month|fully allocated|over-allocated by \d+%))?$/);
    expect(field(con.form?.fields, "percent")).toMatchObject({ value: "50" });
    expect(field(con.form?.fields, "standing")).toMatchObject({ value: "false" });
    expect(con.form?.confirm?.label).toBe("Add {person} to CON");
    const int = await addCard(maya, { projectKey: "INT" });
    expect(field(int.form?.fields, "percent")).toMatchObject({ value: "100" });
    expect(field(int.form?.fields, "standing")).toMatchObject({ value: "true" });
    expect([freeLabel(40), freeLabel(0), freeLabel(-20), freeLabel(null)]).toEqual([" · 40% free this month", " · fully allocated", " · over-allocated by 20%", ""]);
  });

  it("AC7 the card's text fields arrive as a number and a yes/no, and the month defaults to this one", async () => {
    const maya = await db.as("maya");
    await registry.call(maya, "allocate", { person: "Dinesh Wickrama", projectKey: "INT", percent: "60", standing: "true" }, { source: "mcp" });
    const [s] = await db.tx((tx) => tx.execute(sql`select s.percent from allocations.standing s join delivery.project p on p.id = s.project_id where p.key = 'INT' and s.until_month is null`));
    expect(s.percent).toBe(60);
  });
});
