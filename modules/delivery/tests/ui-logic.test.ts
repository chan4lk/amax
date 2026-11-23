import { describe, expect, it } from "vitest";
import type { ReleaseRow } from "../server/queries";
import { axisMax, runs } from "../ui/charts";
import { csvCell, csvText } from "../ui/csv";
import { count } from "../ui/ProjectsPage";
import { actionFor, mapPill, mapRow, nextStep, onActiveMap, standing } from "../ui/ReleasesPage";

// 041 review round 1: pure UI logic, table-driven.
describe("CSV export neutralises formulas", () => {
  it.each([
    ["=HYPERLINK(\"http://x\")", "\"'=HYPERLINK(\"\"http://x\"\")\""],
    ["+1+2", "\"'+1+2\""],
    ["-2+3", "\"'-2+3\""],
    ["@SUM(A1)", "\"'@SUM(A1)\""],
    ["\tcmd", "\"'\tcmd\""],
    ["\rcmd", "\"'\rcmd\""],
    ["Invoice export to PDF", "\"Invoice export to PDF\""],
    ["a \"quoted\" title", "\"a \"\"quoted\"\" title\""],
    ["", "\"\""],
  ])("%j", (raw, want) => expect(csvCell(raw)).toBe(want));
  it("joins cells and rows", () => expect(csvText([["a", "=b"], ["c", "d"]])).toBe("\"a\",\"'=b\"\n\"c\",\"d\""));
});

describe("pluralise on the same count", () => {
  it.each([[0, "0 clients"], [1, "1 client"], [2, "2 clients"]])("%i", (n, want) => expect(count(n as number, "client")).toBe(want));
});

const st = (environment: string, position: number, isProd: boolean, status: string | null, at: string | null = null) => ({ environment, environmentId: `env-${environment}`, deploymentId: status ? `dep-${environment}` : null, position, isProd, status, at, note: null, run: null });
const rel = (over: Partial<ReleaseRow>, ...stages: ReturnType<typeof st>[]): ReleaseRow =>
  ({ id: over.version ?? "r", projectId: "p1", version: "v1", projectKey: "CON", projectName: "Contoso", projectColor: "violet", proposals: 1, ...over, stages });

describe("one standing for the table, the map and the pill", () => {
  const cases: [string, ReleaseRow, string | null, string | null, string][] = [
    ["nothing reached", rel({}, st("Dev", 1, false, null), st("Prod", 2, true, null)), null, null, "Deploy to Dev"],
    ["testing in QA", rel({}, st("Dev", 1, false, "deployed", "2026-10-12T09:00:00Z"), st("QA", 2, false, "testing", "2026-10-15T09:00:00Z"), st("Prod", 3, true, null)), "QA", "Testing since Oct 15", "Promote to Prod"],
    ["live in Prod", rel({}, st("Dev", 1, false, "deployed", "2026-09-22T09:00:00Z"), st("Prod", 2, true, "deployed", "2026-10-01T09:00:00Z")), "Prod", "Live since Oct 1", "Live"],
    // A stage after Prod rolled back while Prod stays deployed: every view says Live (they used to disagree).
    ["live, a later stage rolled back", rel({}, st("Prod", 1, true, "deployed", "2026-10-01T09:00:00Z"), st("Demo", 2, false, "rolled-back", "2026-10-03T09:00:00Z")), "Demo", "Live since Oct 1", "Live"],
    ["live, a later stage reached", rel({}, st("Prod", 1, true, "deployed", "2026-10-01T09:00:00Z"), st("Demo", 2, false, "deployed", "2026-10-03T09:00:00Z")), "Demo", "Live since Oct 1", "Live"],
  ];
  it.each(cases)("%s", (_, r, lastEnv, pill, action) => {
    const s = standing(r);
    expect(s.last?.environment ?? null).toBe(lastEnv);
    expect(mapPill(r)?.text ?? null).toBe(pill);
    expect(mapRow(r, r.stages.map((x) => x.environment)).stations.find((x) => x.last)?.environment ?? null).toBe(lastEnv);
    expect(nextStep(r) === null).toBe(action === "Live");
    expect(actionFor(r, true).text).toBe(action === "Deploy to Dev" ? "Building" : action.replace(/^(Promote|Deploy) to /, "Next: "));
  });
});

describe("the action cell keeps the first deployment reachable", () => {
  const fresh = rel({ version: "v2.5.0" }, st("Dev", 1, false, null), st("Prod", 2, true, null));
  const moving = rel({}, st("Dev", 1, false, "deployed", "2026-10-12T09:00:00Z"), st("Prod", 2, true, null));
  it.each([
    ["nothing reached, may record: a link to the release page", fresh, true, { kind: "link", text: "Building", href: "/delivery/releases/CON/v2.5.0" }],
    ["nothing reached, may not record: text", fresh, false, { kind: "text", text: "Building" }],
    // 081 amendment 5 (AC-61): no button in the row; what's next as text, the deployment from the row's pin.
    ["moving, may record: what's next", moving, true, { kind: "text", text: "Next: Prod" }],
    ["moving, may not record: what's next", moving, false, { kind: "text", text: "Next: Prod" }],
  ])("%s", (_, r, allowed, want) => expect(actionFor(r, allowed)).toMatchObject(want));
});

describe("the Active map", () => {
  const now = new Date("2026-10-16T15:00:00Z");
  const live = (version: string, at: string, projectId = "p1") => rel({ version, projectId }, st("Dev", 1, false, "deployed", at), st("Prod", 2, true, "deployed", at));
  const moving = (version: string, at: string, projectId = "p1") => rel({ version, projectId }, st("Dev", 1, false, "deployed", at), st("Prod", 2, true, null));
  const failed = (version: string, at: string) => rel({ version }, st("Dev", 1, false, "rolled-back", at), st("Prod", 2, true, null));
  const prodBack = (version: string, at: string) => rel({ version }, st("Dev", 1, false, "deployed", at), st("Prod", 2, true, "rolled-back", at));
  const fresh = (version: string) => rel({ version }, st("Dev", 1, false, null), st("Prod", 2, true, null));
  // Rows arrive newest-written first; nothing here may depend on that or on deployment timing races.
  it.each([
    ["a recent live release, nothing in flight", [live("v1", "2026-10-01T09:00:00Z")], ["v1"]],
    ["a live release more than 45 days old", [live("v1", "2026-08-20T09:00:00Z")], []],
    ["a release in flight replaces the live one", [moving("v2", "2026-10-05T09:00:00Z"), live("v1", "2026-10-01T09:00:00Z")], ["v2"]],
    ["overlap: deployed to Dev before the live one reached Prod and not moved since", [moving("v2", "2026-09-20T09:00:00Z"), live("v1", "2026-10-01T09:00:00Z")], ["v1"]],
    ["a newer release that failed after the live Prod still needs a retry", [failed("v2", "2026-10-05T09:00:00Z"), live("v1", "2026-10-01T09:00:00Z")], ["v2"]],
    ["an abandoned Dev-only release older than the live one", [live("v2", "2026-10-01T09:00:00Z"), moving("v1.5", "2026-06-01T09:00:00Z")], ["v2"]],
    ["an older release whose Prod rolled back, next to a newer live one", [live("v2", "2026-10-01T09:00:00Z"), prodBack("v1.9", "2026-09-10T09:00:00Z")], ["v2"]],
    ["a stale release in flight (no deployment for 45 days), nothing live", [moving("v1", "2026-07-01T09:00:00Z")], []],
    ["two live releases: only the latest Prod, whatever the row order", [live("v0.9", "2026-09-01T09:00:00Z"), live("v1", "2026-10-01T09:00:00Z")], ["v1"]],
    ["a newer release not deployed anywhere changes nothing", [fresh("v2"), live("v1", "2026-10-01T09:00:00Z")], ["v1"]],
    ["projects are independent", [moving("v9", "2026-10-05T09:00:00Z", "p2"), live("v1", "2026-10-01T09:00:00Z")], ["v9", "v1"]],
  ])("%s", (_, releases, want) => expect(onActiveMap(releases as ReleaseRow[], now).map((r) => r.version)).toEqual(want));
});

describe("line chart runs never bridge a missing week", () => {
  it.each([
    ["no gaps", [1, 2, 3], [[[0, 1], [1, 2], [2, 3]]]],
    ["a gap in the middle", [1, null, 3, 4], [[[0, 1]], [[2, 3], [3, 4]]]],
    ["a gap at the start", [null, 2, 3], [[[1, 2], [2, 3]]]],
    ["a gap at the end", [1, 2, null], [[[0, 1], [1, 2]]]],
    ["all missing", [null, null], []],
    ["a zero is data, not a gap", [0, null, 0], [[[0, 0]], [[2, 0]]]],
  ])("%s", (_, data, want) => expect(runs(data as (number | null)[])).toEqual(want));
});

describe("line chart draws the latest marker only when the latest week has data", () => {
  it.each([
    ["latest week present", [1, 2, 3], 1],
    ["latest week missing", [1, 2, null], 0],
    ["only the latest week present", [null, null, 3], 1],
  ])("%s", async (_, data, markers) => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { LineChart } = await import("../ui/charts");
    const html = renderToStaticMarkup(createElement(LineChart, { id: "t", label: "t", labels: ["W1", "W2", "W3"], max: 4, step: 2, series: [{ name: "Done", color: "#000", data: data as (number | null)[] }] }));
    expect(html.match(/r="5"/g)?.length ?? 0).toBe(markers);
  });
});

describe("the line chart's axis grows with the data (final review)", () => {
  it.each([
    ["the mock's data keeps 40", [24, 38, 36, null], 40],
    ["a week above 40 rounds up to the next step", [24, 41], 50],
    ["exactly on a step", [60], 60],
    ["no data keeps the floor", [null, null], 40],
  ])("%s", (_, values, want) => expect(axisMax(values as (number | null)[], 40, 10)).toBe(want));
});
