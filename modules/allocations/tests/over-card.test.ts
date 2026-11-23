import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import allocations from "../module";
import { allocationsDatabase } from "./setup";

describe.skipIf(!hasDb)("a change past 100% is asked about, and on a card it is a note, not a block (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  const tool = createRegistry([allocations]).all.find((t) => t.name === "allocate")!;
  const ask = { person: "Ayesha Rahman", projectKey: "CON", month: "2026-12", percent: 100 };
  beforeAll(async () => { db = await allocationsDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC11 the model's own call past 100% is refused with the question to ask", async () => {
    await expect(tool.propose!(await db.as("maya") as never, ask as never)).rejects.toThrow(/Are you sure/);
  });

  it.each([["until further notice", true], ["this month only", false]])("AC11 the same change edited on a card (%s) is not refused", async (_name, standing) => {
    await expect(tool.propose!(await db.as("maya") as never, { ...ask, standing } as never)).resolves.toBeUndefined();
  });

  it("AC11 the card says who would be over, beside the field", async () => {
    const note = await tool.note!(await db.as("maya") as never, { ...ask, standing: false } as never);
    expect(note).toMatch(/Ayesha Rahman would be at \d+% in /);
    expect(note).toMatch(/You can still add them\.$/);
  });

  it("AC11 an overOk call is never refused", async () => {
    await expect(tool.propose!(await db.as("maya") as never, { ...ask, overOk: true } as never)).resolves.toBeUndefined();
  });
});
