import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { gridFor } from "../server/grid";
import { allocationsDatabase, TODAY } from "./setup";

describe.skipIf(!hasDb)("AC1 the grid carries what the new look draws", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => {
    db = await allocationsDatabase();
  }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC1 every person has a job title and the grid runs six months", async () => {
    const grid = await gridFor(await db.as("maya", "Leadership"), { today: TODAY, everyone: true });
    expect(grid.months).toHaveLength(6);
    expect(grid.people.length).toBeGreaterThan(0);
    expect(grid.people.every((p) => p.title.length > 0)).toBe(true);
  });

  it("AC2 a line is editable only where the viewer may allocate, whoever manages the project", async () => {
    const grid = await gridFor(await db.as("maya", "PM"), { today: TODAY, everyone: true });
    const lines = grid.people.flatMap((p) => p.lines);
    const flags = (key: string) => [...new Set(lines.filter((l) => l.projectKey === key).map((l) => l.editable))];
    expect(flags("CON")).toEqual([true]);
    expect(flags("FLT")).toEqual([false]);
    expect(lines.filter((l) => !l.projectKey).every((l) => !l.editable)).toBe(true);
  });
});
