import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { createRegistry } from "@amax/mcp";
import delivery from "../module";
import { linkCard } from "../server/write-cards";
import { proposalDb } from "./proposal-db";

const branchOf = async (v: Viewer, a: { projectKey: string; defaultBranch?: string }) => {
  const field = (await linkCard(v, a)).form?.fields.find((f) => f.name === "defaultBranch");
  return field?.kind === "chips" ? { value: field.value, options: field.options.map((o) => o.value) } : null;
};

describe.skipIf(!hasDb)("106 review round 1 (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const registry = createRegistry([delivery]);
  beforeAll(async () => {
    db = await proposalDb();
    maya = await db.as("maya");
    await registry.call(maya, "link_project_repo", { projectKey: "CON", repoUrl: "https://github.com/example/contoso-portal", defaultBranch: "develop" }, { source: "mcp" });
  }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    ["a relink keeps the stored branch", { projectKey: "CON" }, { value: "develop", options: ["develop", "main"] }],
    ["the branch asked for wins", { projectKey: "CON", defaultBranch: "release" }, { value: "release", options: ["release", "main"] }],
    ["a project never linked starts on main", { projectKey: "FLT" }, { value: "main", options: ["main"] }],
  ])("B1 the link card's branch: %s", async (_name, args, expected) => {
    expect(await branchOf(maya, args)).toEqual(expected);
  });

  it.each([["x"], ["1AB"], ["TOOLONGKEY12"], ["ab"]])("B4 the key rule is the schema's alone: %j is refused by it, next to Key", async (key) => {
    const tool = registry.toolsFor(maya).find((t) => t.name === "set_up_project")!;
    const parsed = tool.draft!.safeParse({ key });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["key"]);
    await expect(tool.propose!(maya as never, { key } as never)).resolves.toBeUndefined();
  });
});
