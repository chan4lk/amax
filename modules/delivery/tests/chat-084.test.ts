import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { chatIntents } from "../chat";
import { mcpTools } from "../mcp";
import { proposalDb } from "./proposal-db";

// 084: a new proposal with no project asks "Which project?" with quick replies, from the person's own projects.
describe("084 the project question", () => {
  it("AC4 New proposal asks which project with quick replies of the person's own projects, from the button or typed", () => {
    const ask = chatIntents.find((i) => i.id === "delivery.new-proposal")!.fields.find((f) => f.name === "projectKey")!.ask;
    const description = mcpTools.find((t) => t.name === "create_proposal")!.description;
    for (const text of [ask, description]) {
      expect(text).toMatch(/list_projects with mine true/);
      expect(text).toMatch(/offer_answers/);
      expect(text).toMatch(/<KEY> · <Name>/);
      // Product owner, 2026-11-05: one project of your own is a button beside "Another project", which then lists the
      // others you may add to; chat never picks the project for you.
      expect(text).toMatch(/Exactly one: offer_answers with that one and "Another project"/);
      expect(text).toMatch(/the user picks Another project: call list_projects without mine/);
      expect(text).toMatch(/Never pick the project for them/);
    }
    expect(description.indexOf("Which project is it for?")).toBeLessThan(description.indexOf("settle the owner"));
  });
});

describe.skipIf(!hasDb)("084 list_projects mine (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  beforeAll(async () => { db = await proposalDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC3 mine keeps the projects the viewer manages or is assigned to; without it, every active project", async () => {
    const tool = mcpTools.find((t) => t.name === "list_projects")!;
    const keys = async (who: string, mine?: boolean) => ((await tool.run((await db.as(who)) as never, (mine ? { mine } : {}) as never, "mcp" as never)) as { key: string }[]).map((p) => p.key).sort();
    expect(await keys("maya", true)).toEqual(["CON"]);
    expect(await keys("nimal", true)).toEqual(["CON", "FLT"]);
    expect(await keys("kasun", true)).toEqual([]);
    expect(await keys("kasun")).toEqual(expect.arrayContaining(["CON", "FLT", "HRI"]));
  });
});
