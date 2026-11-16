import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { createRegistry } from "@amax/mcp";
import { chatTurn, confirmAction } from "@amax/chat";
import type { CardField } from "@amax/core";
import delivery from "../module";
import { chatIntents } from "../chat";
import { proposalDb, T } from "./proposal-db";

const options = (f: CardField | undefined) => (f?.kind === "chips" ? f.options.map((o) => o.label) : []);

describe.skipIf(!hasDb)("106 the Set up a project card (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const registry = createRegistry([delivery]);
  const turn = (tool: string, input: Record<string, unknown>) => {
    configureAi({ db: db.app, model: "m", provider: fakeProvider([() => ({ toolCalls: [{ type: "tool_use" as const, id: "c", name: tool, input }] }), () => ({ text: "Check the card." })]) });
    return chatTurn(db.app, registry, maya, { text: "set up a project" });
  };
  beforeAll(async () => {
    db = await proposalDb();
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
    maya = await db.as("maya");
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC3 the first reply is the card, with what the message gave filled and the rest left for the card", async () => {
    const t = await turn("set_up_project", { name: "Northwind Portal", key: "NWP" });
    const card = t.pending[0];
    expect(card).toMatchObject({ tool: "set_up_project", title: "Set up NWP · Northwind Portal", input: { name: "Northwind Portal", key: "NWP" } });
    expect(card.form?.fields.map((f) => f.name)).toEqual(["name", "key", "client", "billing", "repoUrl", "defaultBranch"]);
    expect(card.form?.optional?.fields).toEqual(["repoUrl", "defaultBranch"]);
  });

  it("AC5 client offers Internal and existing clients with a new one; billing offers four chips", async () => {
    const fields = (await turn("set_up_project", { name: "Northwind Portal" })).pending[0].form!.fields;
    const client = fields.find((f) => f.name === "client");
    expect(options(client)).toEqual(expect.arrayContaining(["Internal", "Contoso"]));
    expect(client).toMatchObject({ other: "+ new…" });
    expect(options(fields.find((f) => f.name === "billing"))).toEqual(["Fixed", "T&M", "Retainer", "Internal"]);
  });

  it("AC7 the edited card creates and links, and its receipt names what was written", async () => {
    const t = await turn("set_up_project", { name: "Northwind Portal", key: "NWP" });
    const edits = { client: "Northwind", billing: "t&m", repoUrl: "https://github.com/example/northwind-portal", defaultBranch: "main" };
    const done = await confirmAction(db.app, registry, maya, t.conversationId, t.pending[0].id, { edits });
    expect(done.action.look?.done).toBe("Created NWP · Northwind Portal, linked github.com/example/northwind-portal (main)");
    expect(done.action.form?.confirm?.label).toBe("Create {key} and link repo");
  });

  it("AC9 Link a repo is one card with the repo and branch fields, main preselected", async () => {
    const card = (await turn("link_project_repo", { projectKey: "FLT" })).pending[0];
    expect(card.title).toBe("Link FLT's repo");
    expect(card.form?.fields.map((f) => [f.name, f.value])).toEqual([["repoUrl", undefined], ["defaultBranch", "main"]]);
  });

  it("AC10 someone who can't create projects isn't offered the card", async () => {
    const kasun = await db.as("kasun");
    expect(registry.toolsFor(kasun).map((x) => x.name)).not.toContain("set_up_project");
    expect(registry.toolsFor(maya).map((x) => x.name)).toEqual(expect.arrayContaining(["set_up_project", "create_project", "link_project_repo"]));
  });

  it("AC12 New project runs set_up_project with Internal billing among its options", () => {
    const intent = chatIntents.find((i) => i.id === "delivery.new-project")!;
    expect(intent.tool).toBe("set_up_project");
    const billing = intent.fields.find((f) => f.name === "billing");
    expect(billing && "options" in billing ? billing.options : undefined).toEqual(["fixed", "t&m", "retainer", "internal"]);
  });
});
