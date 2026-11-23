import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ProposalsPage } from "../ui/ProposalsPage";
import { ReleasePage } from "../ui/ReleasePage";
import { ReleasesPage } from "../ui/ReleasesPage";
import { proposalDb } from "./proposal-db";

const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
const crumb = (page: string) => [...(page.match(/<nav class="crumb"[^>]*>(.*?)<\/nav>/)?.[1] ?? "").matchAll(/(?:<a href="([^"]+)">([^<]+)<\/a>)|(?:<span>\/<\/span>([^<]+)$)/g)]
  .map((m) => (m[1] ? `${m[2]} → ${m[1]}` : m[3]));
const tabs = (page: string) => page.match(/<nav class="tabs" aria-label="Sections">(.*?)<\/nav>/)?.[1] ?? "";

describe.skipIf(!hasDb)("081 amendment 5: one way through Delivery (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC54 AC55 a proposal's trail follows its project, and the project's tabs stay with Proposals current", async () => {
    const page = await html(ProposalsPage({ viewer: maya, params: { phase: "CON-014" } }));
    expect(crumb(page)).toEqual(["Projects → /delivery", "Contoso Portal → /delivery/p/CON", "Proposals → /delivery/p/CON/proposals", "CON-014"]);
    expect(tabs(page)).toContain('href="/delivery/p/CON"');
    expect(tabs(page)).toMatch(/href="\/delivery\/p\/CON\/proposals" aria-current="page">Proposals</);
  });

  it("AC54 AC55 a release's trail follows its project, with Releases current; its proposals link to their pages", async () => {
    const page = await html(ReleasePage({ viewer: maya, params: { projectKey: "CON", version: "v2.4.0" } } as never));
    expect(crumb(page)).toEqual(["Projects → /delivery", "Contoso Portal → /delivery/p/CON", "Releases → /delivery/p/CON/releases", "v2.4.0"]);
    expect(tabs(page)).toMatch(/href="\/delivery\/p\/CON\/releases" aria-current="page">Releases</);
    expect(page).toMatch(/<a href="\/delivery\/proposals\/CON-012">/);
  });

  it("AC56 lists link the project and the release they name, as quiet links", async () => {
    const list = await html(ProposalsPage({ viewer: maya, params: {}, searchParams: { project: "CON" } }));
    expect(list).toContain('<a class="quiet" href="/delivery/p/CON">Contoso Portal</a>');
    expect(list).toContain('<a class="quiet" href="/delivery/releases/CON/v2.5.0">v2.5.0</a>');
    const releases = await html(ReleasesPage({ viewer: maya, params: {} } as never));
    expect(releases).toContain('<a class="quiet" href="/delivery/p/FLT">Fleet Tracker</a>');
  });
});
