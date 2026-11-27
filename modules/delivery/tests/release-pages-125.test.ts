import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { mcpTools } from "../mcp";
import { createRelease, recordDeployment } from "../server/services";
import { listReleases, type ReleaseRow } from "../server/queries";
import { filterReleases, listHref } from "../server/release-list";
import { ReleaseTable } from "../ui/ReleaseTable";
import { Loaded, Skeleton } from "../ui/LoadSafe";
import { OPEN, releaseDb } from "./release-db";

const html = (el: ReactElement) => renderToStaticMarkup(el);

describe.skipIf(!hasDb)("125 the release list (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  let rows: ReleaseRow[];
  const table = (releases: ReleaseRow[], filter = {}) => html(createElement(ReleaseTable, { viewer: db.sahan, releases, root: "/r", query: { map: "all", ...filter }, filter, projectKey: "RTK" }));
  beforeAll(async () => {
    db = await releaseDb();
    const make = (version: string, more = {}) => createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version, ...more });
    await make("a1", { name: "Alpha", startDate: "2026-10-05" });
    await make("b1", { name: "Beta", category: "prod", startDate: "2026-10-01", targetDate: "2026-10-10" });
    await make("c1", { name: "Gamma", category: "dev", startDate: "2026-10-03", targetDate: "2026-10-12" });
    await recordDeployment(db.admin(), { projectKey: "RTK", version: "c1", environment: "Dev" });
    rows = await listReleases(db.sahan, { projectKey: "RTK" });
  }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC-1 each row: name and version, category, status chip, dates, proposals, progress; Off track and late named", () => {
    const out = table(rows);
    expect(out).toMatch(/<b>Alpha<\/b><\/a><br\/><small class="muted">a1<\/small>/);
    expect(out).toContain('<span class="chip info">In progress</span>');
    expect(out).toContain('<span class="chip bad">Off track</span>');
    expect(out).toMatch(/chip good">Completed<\/span><span class="chip warn">late<\/span>/);
    expect(out).toContain("5 Oct 2026");
    expect(out).toContain("Dev deployed, QA not yet, UAT not yet, Prod not yet");
  });

  it("AC-2 status, category and sort filter the list, on the page and in list_releases alike", async () => {
    const names = (list: ReleaseRow[]) => list.map((r) => r.name);
    expect(names(filterReleases(rows, { status: "overdue" }))).toEqual(["Beta"]);
    expect(names(filterReleases(rows, { category: "dev" }))).toEqual(["Gamma"]);
    expect(names(filterReleases(rows, { sort: "start" }))).toEqual(["Beta", "Gamma", "Alpha"]);
    expect(names(filterReleases(rows, { sort: "target" }))).toEqual(["Beta", "Gamma", "Alpha"]);
    const tool = mcpTools.find((t) => t.name === "list_releases")!;
    expect(names(await tool.run(db.sahan as never, { projectKey: "RTK", status: "overdue" } as never, "mcp") as ReleaseRow[])).toEqual(["Beta"]);
    expect(listHref("/r", { map: "all", status: "planned" }, { category: "uat" })).toBe("/r?map=all&status=planned&category=uat");
    expect(table(rows, { status: "completed" })).toMatch(/aria-label="Status"><a href="\/r\?map=all"[^>]*>All<\/a>.*aria-current="true">Completed/);
  });

  it("AC-3 no releases, and none matching, each say so; Clear filters keeps the map's range", () => {
    expect(table([])).toContain("No releases yet");
    const none = table(rows, { status: "planned", category: "dev" });
    expect(none).toContain("No releases match these filters");
    expect(none).toContain('href="/r?map=all">Clear filters');
  });

  it("AC-4 a skeleton while loading; a failed read says so with Try again", async () => {
    expect(html(createElement(Skeleton, { what: "releases" }))).toContain('aria-busy="true"');
    const failed = await Loaded({ what: "releases", retry: "/r?status=planned", load: () => Promise.reject(new Error("db down")), children: () => null });
    const out = html(failed as ReactElement);
    expect(out).toContain("Couldn&#x27;t load releases.");
    expect(out).toContain('href="/r?status=planned">Try again');
  });
});
