import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, setProvided } from "@amax/core/server";
import { PROPOSAL_TIME_SLOT, type ProposalTimeSource } from "../contracts";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { mcpTools, search } from "../mcp";
import { ctxFor } from "../server/context";
import { createProposal, moveProposal, syncProposal } from "../server/services";
import { updateProposal } from "../server/lifecycle";
import { getProject } from "../server/queries";
import { markTaskDone } from "../server/tasks";
import { ProjectPage } from "../ui/ProjectPage";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb } from "./proposal-db";

const html = async (node: Promise<unknown> | unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
const getProposal = mcpTools.find((t) => t.name === "get_proposal")!.run as unknown as (v: Viewer, a: object) => Promise<Record<string, unknown> | null>;

describe.skipIf(!hasDb)("081 the proposal page (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.t.drop());
  // Review round 2: a test that fills the time slot never leaks it into the next, even when it fails.
  afterEach(() => setProvided([]));

  // 087 AC-8, AC-9 (first in the file: slots are still unset here). The page says when time lines may be missing.
  // 087 AC-8, AC-9, final pass: one rule. No Time source (slots never set, or Time switched off) reads as "unread" on the
  // page (and a pin is refused as unavailable, review-2 below); a source that stopped early reads "partial".
  const answers = (partial: boolean) => [{ id: "time", provides: { [PROPOSAL_TIME_SLOT]: (async () => ({ lines: [], partial })) satisfies ProposalTimeSource } }];
  it.each([
    ["Time switched off", [], "unread"],
    ["Time stopped reading early", answers(true), "partial"],
    ["Time read every line", answers(false), null],
  ] as const)("087 AC8 AC9 the history with %s notes %s", async (_label, slots, want) => {
    setProvided(slots as never);
    expect(((await getProposal(maya, { key: "CON-014" }))! as { timeNote: string | null }).timeNote).toBe(want);
    const page = await html(ProposalsPage({ viewer: maya, params: { phase: "CON-014" } }));
    expect(page.includes("the Time module isn&#x27;t running")).toBe(want === "unread");
  });

  it("AC6 the page shows the proposal's project, phase, owner, time, release, tasks and history, and says when there's none", async () => {
    await moveProposal(ctxFor(maya), { key: "FLT-015", to: "planned" });
    const page = await html(ProposalsPage({ viewer: maya, params: { phase: "FLT-015" } }));
    expect(page).toContain("FLT-015 Bulk upload");
    expect(page).toContain('href="/delivery/p/FLT"');
    expect(page).toMatch(/<dt>Owner<\/dt><dd>.*?<b>Kasun Dias<\/b><\/dd>/);
    // Amendment 4 (AC-50): history is a timeline: what happened, then who, then a live age.
    expect(page).toMatch(/<li class="moved pinnable"><svg[^>]*>.*?<\/svg><span>Moved Proposed → Planned<small class="muted"><b>Maya/);
    // AC-47: the stepper says the phase, marking the current step.
    expect(page).toMatch(/<li class="current" aria-current="step"><svg[^>]*>.*?<\/svg><b>Planned<\/b>/);
    const con = await html(ProposalsPage({ viewer: maya, params: { phase: "CON-014" } }));
    expect(con).toMatch(/v2\.5\.0/);
    expect(con).toMatch(/<b>T1<\/b>/);
    expect(await html(ProposalsPage({ viewer: maya, params: { phase: "CON-404" } }))).toContain("Proposal not found");
    expect(await html(ProposalsPage({ viewer: maya, params: { phase: "planned" } }))).toContain("FLT-015");
  });

  // Review round 1 (R3, AGENTS rule 2): every stage step and history line pins its own record, and each pin resolves
  // through its read tool to exactly that record.
  type Pin = { label: string; tool: string; args: Record<string, string> };
  const pinsIn = (page: string) => [...page.matchAll(/data-pin="([^"]+)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")) as Pin);
  const resolve = async (p: Pin) => {
    const t = mcpTools.find((x) => x.name === p.tool)! as unknown as { run: (v: Viewer, a: object) => Promise<unknown>; pin: { id: string; of: (r: unknown) => { id: string; label: string } | null } };
    return t.pin.of(await t.run(maya, p.args));
  };
  it.each([
    ["the proposal page's release steps", () => ProposalsPage({ viewer: maya, params: { phase: "CON-014" } }), ["get_deployment", "get_environment"]],
    ["the proposal page's history lines", () => ProposalsPage({ viewer: maya, params: { phase: "CON-014" } }), ["get_proposal_event"]],
    ["the board band's release steps", () => ProjectPage({ viewer: maya, params: { key: "CON" } }), ["get_deployment", "get_environment"]],
  ])("review-1 %s each pin a record their read tool resolves", async (_label, render, tools) => {
    const page = await html(render());
    // One pin per step or line, inside the track or the timeline itself.
    const rows = tools.includes("get_proposal_event") ? page.split('class="dv-timeline"')[1].split("</ol>")[0] : page.split('class="dv-track"')[1].split("</ol>")[0];
    const pins = pinsIn(rows).filter((p) => tools.includes(p.tool));
    expect(pins.length).toBeGreaterThan(0);
    expect(pins.length).toBe((rows.match(/<li /g) ?? []).length);
    for (const p of pins) {
      const r = await resolve(p);
      expect(r, `${p.tool} ${JSON.stringify(p.args)}`).not.toBeNull();
      const idArg = { get_deployment: "deploymentId", get_environment: "environmentId", get_proposal_event: "proposalId" }[p.tool]!;
      expect(r!.id).toBe(p.args[idArg]);
      expect(r!.label).toBe(p.label);
    }
  });

  it("AC7 the list, the board and search all lead to the proposal's page", async () => {
    expect(await html(ProposalsPage({ viewer: maya, params: {}, searchParams: { project: "CON" } }))).toContain('href="/delivery/proposals/CON-014"');
    expect(await html(ProjectPage({ viewer: maya, params: { key: "CON" } }))).toContain('href="/delivery/proposals/CON-014"');
    expect((await search(maya, "CON-014")).find((h) => h.type === "proposal")).toMatchObject({ url: "/delivery/proposals/CON-014" });
  });

  it("AC8 get_proposal reads one proposal by id or key, with tasks, release stages and history, withdrawn ones too", async () => {
    const one = (await getProposal(maya, { key: "CON-014" }))!;
    expect(one).toMatchObject({ key: "CON-014", href: "/delivery/proposals/CON-014", release: "v2.5.0", withdrawn: false });
    expect((one.tasks as unknown[]).length).toBeGreaterThan(0);
    expect((one.stages as { environment: string }[]).map((s) => s.environment)).toEqual(["Dev", "QA", "UAT", "Prod"]);
    expect(await getProposal(maya, { proposalId: one.id as string, key: "CON-012" })).toBeNull();
    await db.t.owner`update delivery.proposal set withdrawn_at = now(), withdrawn_by = 'test', withdraw_reason = 'dropped' where key = 'CON-011'`;
    expect(await getProposal(maya, { key: "CON-011" })).toMatchObject({ withdrawn: true, withdrawReason: "dropped" });
  });

  it("AC28 time lines come from whoever fills the slot (Time, under its own rule), by the proposal's id, and survive a rekey", async () => {
    const nimal = await db.as("nimal");
    const { id, project: { id: projectId } } = (await getProposal(maya, { key: "CON-017" }))! as { id: string; project: { id: string } };
    // Review round 1: Delivery no longer reads Time's audit rows or copies its rule. A stand-in for Time fills the slot:
    // lines for this proposal's id, shown to Nimal and Maya only (Time's real rule is tested in Time, proposal-time.test.ts).
    const base = { actor: `user:${nimal.userId}`, onBehalfOf: null, userId: nimal.userId, day: "2026-10-19", proposalId: id };
    const asked: { id: string; projectId: string }[] = [];
    const stub: ProposalTimeSource = async (_tx, v, p) => {
      asked.push(p);
      if (p.id !== id || ![nimal.userId, maya.userId].includes(v.userId)) return { lines: [], partial: false };
      return { partial: false, lines: [
        { ...base, id: "time:1", at: "2026-10-19T09:00:00.000Z", hours: 2 },
        { ...base, id: "time:2", at: "2026-10-19T10:00:00.000Z", hours: 2.5, previousProposalId: id },
        { ...base, id: "time:3", at: "2026-10-19T11:00:00.000Z", hours: 2.5, deleted: true },
      ] };
    };
    const lines = async (v: Viewer, key = "CON-017") => ((await getProposal(v, { key }))!.history as { text: string }[]).map((h) => h.text).filter((t) => /logged|Corrected|Removed/.test(t));
    const want = ["Removed Nimal Silva's 2.5 h for Oct 19", "Corrected Nimal Silva's entry for Oct 19 to 2.5 h", "Nimal Silva logged 2 h for Oct 19"];
    // With Time switched off, nothing fills the slot and there are no time lines.
    setProvided([]);
    expect(await lines(nimal)).toEqual([]);
    setProvided([{ id: "time", provides: { [PROPOSAL_TIME_SLOT]: stub } }]);
    expect(await lines(nimal)).toEqual(want);
    expect(await lines(maya)).toEqual(want);
    expect(await lines(await db.as("kasun"))).toEqual([]);
    expect(asked.at(-1)).toEqual({ id, projectId });
    await syncProposal(ctxFor(maya), { projectKey: "CON", project: { name: "Contoso Portal", client: "Contoso" }, key: "CON-017", title: "Spec 017", phase: "building",
      tasksDone: 0, tasksTotal: 0, source: "specclaw", sourceRef: "017-spec", releasedAt: null, meta: {}, committedAt: "2026-10-12T09:00:00Z" });
    const [moved] = await db.q(sql`select key from delivery.proposal where id = ${id}`);
    expect(moved.key).toMatch(/^CON-H\d{3}$/);
    expect(await lines(nimal, moved.key as string)).toEqual(want);
  });

  // Review round 2 (B3): a pinned line is read by its kind and id, with no window: one older than the page's newest 100
  // still resolves, a line that isn't there is null, and a time line the viewer may not see is refused, never "gone".
  it("review-2 a history line's pin reads that line directly", async () => {
    const event = mcpTools.find((t) => t.name === "get_proposal_event")!.run as unknown as (v: Viewer, a: object) => Promise<Record<string, unknown> | null>;
    // 093: a project without a repo (CON's has synced a spec proposal earlier in this file, so it's agent-first).
    const { key } = await createProposal(ctxFor(maya), { projectKey: "FLT", title: "Many edits" });
    const { id } = (await getProposal(maya, { key }))! as { id: string };
    const created = ((await getProposal(maya, { key }))!.history as { id: string; kind: string }[]).find((h) => h.kind === "created")!;
    for (let i = 0; i < 101; i++) await updateProposal(ctxFor(maya), { key, description: `Draft ${i}` });
    expect(((await getProposal(maya, { key }))!.history as { id: string }[]).some((h) => h.id === created.id)).toBe(false);
    const refuse: ProposalTimeSource = async (_tx, _v, _p, opts) => { if (opts?.line) throw new ForbiddenError("time:read", "time.entry"); return { lines: [], partial: false }; };
    setProvided([{ id: "time", provides: { [PROPOSAL_TIME_SLOT]: refuse } }]);
    const cases: [string, object, (r: unknown) => void][] = [
      ["a created line older than the newest 100", { proposalId: id, line: created.id }, (r) => expect(r).toMatchObject({ kind: "created", line: created.id, key })],
      ["a line that isn't there", { proposalId: id, line: "audit:999999999" }, (r) => expect(r).toBeNull()],
      ["a task line on another proposal", { proposalId: id, line: "task:00000000-0000-4000-8000-000000000001" }, (r) => expect(r).toBeNull()],
      ["a time line this viewer may not see", { proposalId: id, line: "time:1" }, (r) => expect(r).toBeInstanceOf(ForbiddenError)],
    ];
    // Review round 3 (B3): with Time switched off there is nothing to ask, so a time line is unreadable, not gone.
    cases.push(["a time line with Time switched off", { proposalId: id, line: "time:1", off: true }, (r) => expect(r).toMatchObject({ code: "unavailable", retryable: true, message: expect.stringMatching(/Time module isn't running/) })]);
    for (const [label, args, check] of cases) {
      if ((args as { off?: boolean }).off) setProvided([]);
      const r = await event(maya, args).catch((e: unknown) => e);
      try { check(r); } catch (e) { throw new Error(`${label}: ${(e as Error).message}`); }
    }
  }, 60_000);

  it("081 amendment 4 AC42 AC47 AC50 history lines carry their kind, a move its phase, a closed task who closed it; the project counts closes by agents and people", async () => {
    const before = (await getProject(maya, "CON"))!.closedBy;
    await db.t.owner`insert into delivery.task (tenant_id, proposal_id, ref, title) select tenant_id, id, 'T90', 'Amendment 4 check' from delivery.proposal where key = 'CON-014'`;
    const open = { ref: "T90" };
    await markTaskDone(ctxFor(maya), { key: "CON-014", task: open.ref as string });
    const after = (await getProject(maya, "CON"))!.closedBy;
    expect(after).toEqual({ agents: before.agents, people: before.people + 1, automation: before.automation });
    const one = (await getProposal(maya, { key: "CON-014" }))! as { history: { kind: string; text: string; by: string; to?: string }[] };
    expect(one.history.find((h) => h.kind === "task" && h.text.startsWith(`${open.ref as string} `))).toMatchObject({ by: expect.stringContaining("Maya") });
    const flt = (await getProposal(maya, { key: "FLT-015" }))! as { history: { kind: string; to?: string }[] };
    expect(flt.history.find((h) => h.kind === "moved")).toMatchObject({ to: "planned" });
    expect(flt.history.every((h) => ["created", "moved", "task", "time", "edited", "withdrawn", "synced"].includes(h.kind))).toBe(true);
  });
});
