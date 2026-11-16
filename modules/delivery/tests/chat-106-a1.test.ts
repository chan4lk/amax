import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { chatSuggestions } from "../chat-suggestions";
import { proposalDb } from "./proposal-db";

const offered = async (v: Viewer, route: string, params: Record<string, string> = {}) => {
  const out: string[] = [];
  for (const s of chatSuggestions.filter((x) => x.routes.includes(route))) if (!s.when || (await s.when(v as never, params))) out.push(s.label);
  return out;
};

describe.skipIf(!hasDb)("106 amendment 1: what chat suggests on Projects (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  beforeAll(async () => { db = await proposalDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC14 Projects suggests setting up a project and linking a repo to those who may; a project with no repo suggests linking one", async () => {
    const maya = await db.as("maya");
    expect(await offered(maya, "")).toEqual(["Set up a project", "Link a repo to a project", "Which projects need attention?"]);
    expect(await offered(await db.as("kasun"), "")).toEqual(["Which projects need attention?"]);
    expect(await offered(maya, "p/:key", { key: "CON" })).not.toContain("Link a repo");
    const sahan = await db.as("sahan");
    expect(await offered(sahan, "p/:key", { key: "FLT" })).toContain("Link a repo");
  });
});
