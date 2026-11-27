import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { setGrants, type Viewer } from "@amax/auth";
import delivery from "../module";
import { ctxFor } from "../server/context";
import { createProposal } from "../server/services";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb } from "./proposal-db";

const render = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
const csvOf = (html: string) => decodeURIComponent(/href="data:text\/csv;charset=utf-8,([^"]+)"/.exec(html)?.[1] ?? "").replace(/&amp;/g, "&");

// 119 AC-4: the export's Owner column reads like the screens (118): an ownerless proposal is "Unassigned" while open and
// "Not recorded" once released; a named owner is their name.
describe.skipIf(!hasDb)("119 AC-4 the CSV's Owner column (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => { db = await proposalDb(); setGrants([delivery]); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    ["open, no owner", "proposed", null, "Unassigned"],
    ["released, no owner", "released", null, "Not recorded"],
    ["open, owned", "proposed", "Kasun Dias", "Kasun Dias"],
  ])("AC4 %s exports %s", async (_n, phase, owner, expected) => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: `CSV owner ${_n}` });
    await db.t.owner`update delivery.proposal set owner_user_id = null, owner_name = ${owner}, phase = ${phase} where key = ${key}`;
    const csv = csvOf(await render(ProposalsPage({ viewer: maya, params: {}, searchParams: { q: key } })));
    const row = csv.split("\n").find((l) => l.startsWith(`"${key}"`)) ?? "";
    expect(row.split(",").at(-1)?.replace(/"/g, "").trim()).toBe(expected);
  });
});
