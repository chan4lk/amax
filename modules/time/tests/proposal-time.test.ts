import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { acceptSuggestion, setSuggestionKinds } from "@amax/agents/server";
import { configureAi } from "@amax/ai";
import { fakeProvider } from "@amax/ai/fake";
import { chatTurn, confirmAction } from "@amax/chat";
import { mcpTools } from "../mcp";
import { createRegistry } from "@amax/mcp";
import { chatIntents } from "../chat";
import { proposeLog } from "../server/entry-card";
import { EVENTS as DELIVERY, PROPOSAL_TIME_SLOT, type CommitTime } from "@amax/delivery/contracts";
import timeModule from "../module";
import { BATCH, MAX_BATCHES, MAX_LINES, proposalTimeLines } from "../server/proposal-lines";
import { randomUUID } from "node:crypto";
import { appendAudit, ForbiddenError } from "@amax/core/server";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { correctEntry, deleteEntry } from "../server/correct";
import { logTime } from "../server/log";
import { commitDraft, commitTimeHandler } from "../suggestions";
import { installedModules } from "./installed";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("081 time against a proposal (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); setGrants([...(await installedModules()), agentsPlatform as never]); setSuggestionKinds([commitDraft]); }, 120_000);
  afterAll(() => db?.t.drop());

  const proposalOf = async (entryId: string) => (await db.q(sql`select p.key from time.entry e left join delivery.proposal p on p.id = e.proposal_id where e.id = ${entryId}`))[0]?.key ?? null;

  it("AC1 an entry names a proposal of its own project; another project's, an unknown or a withdrawn one is refused", async () => {
    const nimal = ctxFor(await db.as("nimal"));
    const e = await logTime(nimal, { projectKey: "CON", proposalKey: "CON-014", day: "2026-10-19", hours: 2 });
    expect(e).toMatchObject({ proposalKey: "CON-014" });
    expect(await proposalOf(e.id)).toBe("CON-014");
    await expect(logTime(nimal, { projectKey: "FLT", proposalKey: "CON-014", day: "2026-10-19", hours: 1 })).rejects.toThrow(/belongs to CON, not FLT/);
    await expect(logTime(nimal, { projectKey: "CON", proposalKey: "CON-999", day: "2026-10-19", hours: 1 })).rejects.toThrow(/no proposal CON-999/);
    await db.t.owner`update delivery.proposal set withdrawn_at = now(), withdrawn_by = 'test', withdraw_reason = 'dropped' where key = 'CON-011'`;
    await expect(logTime(nimal, { projectKey: "CON", proposalKey: "CON-011", day: "2026-10-19", hours: 1 })).rejects.toThrow(/withdrawn/);
  });

  // 087 AC-10: the proposal link 081 added holds no foreign key into Delivery; getProposalRef still refuses a bad one (AC1).
  it("087 AC10 time.entry.proposal_id has no foreign key into Delivery's proposals", async () => {
    const fks = await db.q(sql`select n.nspname || '.' || t.relname as target from pg_constraint c join pg_class t on t.oid = c.confrelid join pg_namespace n on n.oid = t.relnamespace
      where c.contype = 'f' and c.conrelid = 'time.entry'::regclass`);
    expect(fks.map((k) => k.target)).not.toContain("delivery.proposal");
  });

  it("AC2 accepting a commit's hours logs them on the commit's proposal", async () => {
    const nimal = await db.as("nimal");
    const [con] = await db.q(sql`select id from delivery.project where key = 'CON'`);
    const c: CommitTime = { userId: nimal.userId, projectId: con.id as string, projectKey: "CON", proposalKey: "CON-014", day: "2026-10-20", hours: 1.5, commit: "c0ffee081" };
    await withTenant(db.app, T, (tx) => commitTimeHandler.handle({ tx, tenantId: T, event: { id: "ev-081", name: DELIVERY.commitTime, payload: c } }));
    const [s] = await db.q(sql`select id from agents.suggestion where kind = 'time.commit-draft' and proposed->>'commit' = 'c0ffee081'`);
    await acceptSuggestion(contextForViewer(nimal, "chat"), { id: s.id as string });
    const [entry] = await db.q(sql`select id from time.entry where source_ref = 'git:c0ffee081'`);
    expect(await proposalOf(entry.id as string)).toBe("CON-014");
  });

  it("AC3 a correction keeps the proposal on the same project, clears it on a move, and sets or clears it when named", async () => {
    const nimal = ctxFor(await db.as("nimal"));
    const e = await logTime(nimal, { projectKey: "CON", proposalKey: "CON-014", day: "2026-10-21", hours: 3 });
    await correctEntry(nimal, { entryId: e.id, hours: 2.5 });
    expect(await proposalOf(e.id)).toBe("CON-014");
    await correctEntry(nimal, { entryId: e.id, proposalKey: null });
    expect(await proposalOf(e.id)).toBeNull();
    await correctEntry(nimal, { entryId: e.id, proposalKey: "CON-012" });
    expect(await proposalOf(e.id)).toBe("CON-012");
    await correctEntry(nimal, { entryId: e.id, projectKey: "FLT" });
    expect(await proposalOf(e.id)).toBeNull();
  });

  it("AC26 Log time asks which proposal (optional); the card shows it; the entry keeps its id; none and other-project proposals behave", async () => {
    const intent = chatIntents.find((i) => i.id === "time.log")!;
    expect(intent.required).not.toContain("proposalKey");
    expect(intent.fields.map((f) => f.name)).toContain("proposalKey");
    // 081 amendment 9 (AC-83, AC-84): settled on every log, from the button or typed, with quick replies.
    for (const text of [intent.fields.find((f) => f.name === "proposalKey")!.ask, mcpTools.find((t) => t.name === "log_time")!.description]) {
      expect(text).toMatch(/settle which proposal before the card unless they named one or said none/);
      expect(text).toMatch(/likelyForMe true/);
      // Product owner, 2026-11-05: never pick for them; the likeliest is the first answer.
      expect(text).toMatch(/always ask, even when one row is clearly likeliest \(it goes first\)/);
      expect(text).not.toMatch(/use it, and the card shows it/);
      expect(text).toMatch(/offer_answers with "Which proposal is it for\?"/);
      expect(text).toMatch(/then "None"/);
      // Found in the end-to-end run: "<KEY>" was read as the project key ("CON · …"); it names the proposal key now.
      expect(text).toMatch(/always the full proposal key the row gives \(CON-014\), never just the project key \(CON\)/);
      // Product owner, 2026-11-05: the buttons show only the proposal key and title; the why only orders them.
      expect(text).toContain(`"<proposal key> · <title>", for example "CON-014 · Invoice export to PDF", in the rows' order`);
      expect(text).not.toContain("(<why>)");
    }
    const nimal = await db.as("nimal");
    await expect(proposeLog(nimal, { projectKey: "FLT", proposalKey: "CON-014", day: "2026-10-26", hours: 1 })).rejects.toThrow(/belongs to CON, not FLT/);
    await db.t.owner`insert into ai.settings (tenant_id, zdr_confirmed) values (${T}, true) on conflict do nothing`;
    const registry = createRegistry(await installedModules());
    const log = async (input: Record<string, unknown>) => {
      const provider = fakeProvider([() => ({ toolCalls: [{ type: "tool_use", id: "c1", name: "log_time", input }] }), () => ({ text: "Log it?" })]);
      configureAi({ provider, db: db.app, model: "claude-haiku-5-5" });
      const turn = await chatTurn(db.app, registry, nimal, { text: "log 2 h on CON-014", intent: intent as never });
      expect(provider.calls[0].system).toContain("proposalKey: Which proposal is it for?");
      expect(turn.pending.map((p) => p.tool)).toEqual(["log_time"]);
      const { result } = await confirmAction(db.app, registry, nimal, turn.conversationId, turn.pending[0].id);
      return { card: turn.pending[0].lines ?? [], id: (result as { id: string }).id };
    };
    const withIt = await log({ projectKey: "CON", proposalKey: "CON-014", day: "2026-10-27", hours: 2 });
    expect(withIt.card).toContainEqual({ label: "Proposal", value: "CON-014 Invoice export to PDF" });
    expect(await proposalOf(withIt.id)).toBe("CON-014");
    const without = await log({ projectKey: "CON", day: "2026-10-28", hours: 1 });
    expect(without.card.map((l) => l.label)).not.toContain("Proposal");
    expect(await proposalOf(without.id)).toBeNull();
  }, 60_000);

  it("AC28 Time's audit rows for an entry carry its proposal id, owner, day and hours, so Delivery's history can join on the id", async () => {
    const nimal = ctxFor(await db.as("nimal"));
    const [p14] = await db.q(sql`select id from delivery.proposal where key = 'CON-014'`);
    const e = await logTime(nimal, { projectKey: "CON", proposalKey: "CON-014", day: "2026-10-29", hours: 2 });
    await correctEntry(nimal, { entryId: e.id, hours: 1.5 });
    await deleteEntry(nimal, { entryId: e.id });
    const rows = await db.q(sql`select action, after from core.audit_event where resource = 'time.entry' and resource_id = ${e.id} order by seq`);
    const who = (await db.as("nimal")).userId;
    expect(rows.map((r) => [r.action, (r.after as Record<string, unknown>).proposalId, (r.after as Record<string, unknown>).userId, (r.after as Record<string, unknown>).day, Number((r.after as Record<string, unknown>).hours)])).toEqual([
      ["time.entry.log", p14.id, who, "2026-10-29", 2], ["time.entry.correct", p14.id, who, "2026-10-29", 1.5], ["time.entry.delete", p14.id, who, "2026-10-29", 1.5]]);
    expect((rows[1].after as Record<string, unknown>).previousProposalId).toBe(p14.id);
  });

  // Review round 1 (B4): Delivery's page gets these lines from Time (PROPOSAL_TIME_SLOT), by Time's rule for an entry:
  // its owner, or an approver of the project in the owner's legal entity (mayFix, 071 AC-4). Delivery has no copy of it.
  it.each([
    ["the entry's owner", "nimal", null, true],
    ["the project's PM", "maya", null, true],
    ["an unscoped Admin", "sahan", null, true],
    ["an Admin scoped to another legal entity", "sahan", "other", false],
    ["an engineer who approves nothing on the project", "kasun", null, false],
  ])("review-1 %s sees Nimal's time lines on the proposal: %s", async (_label, who, scope, sees) => {
    expect(timeModule.provides?.[PROPOSAL_TIME_SLOT]).toBe(proposalTimeLines);
    const nimal = await db.as("nimal");
    const [p] = await db.q(sql`select id, project_id from delivery.proposal where key = 'CON-014'`);
    await logTime(ctxFor(nimal), { projectKey: "CON", proposalKey: "CON-014", day: "2026-10-30", hours: 1 });
    const scopeAdmin = (ids: string[] | null) => db.t.owner`update auth.role_assignment set legal_entity_ids = ${ids} where role = 'Admin'
      and user_id = (select id from auth.user where email = 'sahan@lumenlabs.test')`;
    if (scope) {
      const [{ id: other }] = await db.q(sql`select id from core.legal_entity where id <> (select legal_entity_id from auth.user where email = 'nimal@lumenlabs.test') limit 1`);
      await scopeAdmin([other as string]);
    }
    try {
      const v = await db.as(who);
      const { lines } = await withTenant(db.app, T, (tx) => proposalTimeLines(tx, v, { id: p.id as string, projectId: p.project_id as string }));
      expect(lines.some((l) => l.userId === nimal.userId)).toBe(sees);
    } finally {
      if (scope) await scopeAdmin(null);
    }
  });

  // Review round 2 (B3): the rule applies before the 100-line cap (round 3: past one batch, so the second page runs), and one line is read directly for its pin, its owner
  // getting it, someone else refused (not "gone"), and an unknown line empty.
  it("review-2 an owner keeps their own line however many newer lines others logged, and a pin's line is read directly", async () => {
    const nimal = await db.as("nimal");
    const [p] = await db.q(sql`select id, project_id from delivery.proposal where key = 'CON-012'`);
    const proposal = { id: p.id as string, projectId: p.project_id as string };
    await logTime(ctxFor(nimal), { projectKey: "CON", proposalKey: "CON-012", day: "2026-10-26", hours: 1 });
    const tharushi = await db.as("tharushi");
    await withTenant(db.app, T, async (tx) => {
      for (let i = 0; i < BATCH + 50; i++) await appendAudit(tx, ctxFor(tharushi), { action: "time.entry.log", resource: "time.entry", resourceId: randomUUID(), after: { proposalId: proposal.id, userId: tharushi.userId, day: "2026-10-27", hours: 0.25 } });
    });
    const lines = async (v: Viewer, opts?: { line?: string }) => (await withTenant(db.app, T, (tx) => proposalTimeLines(tx, v, proposal, opts))).lines;
    const own = (await lines(nimal)).filter((l) => l.userId === nimal.userId && l.day === "2026-10-26");
    expect(own).toHaveLength(1);
    expect((await lines(await db.as("maya"))).length).toBe(MAX_LINES);
    const cases: [string, () => Promise<unknown>, (r: unknown) => void][] = [
      ["its owner", () => lines(nimal, { line: own[0].id }), (r) => expect(r).toEqual(own)],
      ["an engineer who approves nothing on the project", async () => lines(await db.as("kasun"), { line: own[0].id }).catch((e: Error) => e), (r) => expect(r).toBeInstanceOf(ForbiddenError)],
      ["anyone, for a line that isn't there", () => lines(nimal, { line: "time:999999999" }), (r) => expect(r).toEqual([])],
    ];
    for (const [label, run, check] of cases) { const r = await run(); try { check(r); } catch (e) { throw new Error(`${label}: ${(e as Error).message}`); } }
  }, 60_000);

  // 087 AC-9: the read is bounded. A viewer who may see none of a proposal's many lines gets a partial answer after
  // MAX_BATCHES, never an unbounded scan; someone who sees them all gets the newest MAX_LINES, complete.
  it.each([
    ["one row past the bound", "CON-011", 1, true],
    ["exactly the bound (the last batch ends on the last row)", "FLT-015", 0, false],
  ])("087 AC9 a proposal's time lines are read in at most MAX_BATCHES batches: %s → partial %s", async (_label, key, extra, partial) => {
    const [p] = await db.q(sql`select id, project_id from delivery.proposal where key = ${key}`);
    const proposal = { id: p.id as string, projectId: p.project_id as string };
    const tharushi = await db.as("tharushi");
    const [{ n }] = await db.q(sql`select count(*)::int as n from core.audit_event where resource in ('time.entry', 'time.change_request') and (after->>'proposalId' = ${proposal.id} or after->>'previousProposalId' = ${proposal.id})`);
    await withTenant(db.app, T, async (tx) => {
      for (let i = Number(n); i < BATCH * MAX_BATCHES + extra; i++) await appendAudit(tx, ctxFor(tharushi), { action: "time.entry.log", resource: "time.entry", resourceId: randomUUID(), after: { proposalId: proposal.id, userId: tharushi.userId, day: "2026-10-28", hours: 0.25 } });
    });
    const read = async (who: string) => withTenant(db.app, T, async (tx) => proposalTimeLines(tx, await db.as(who), proposal));
    expect(await read("kasun")).toEqual({ lines: [], partial });
    const maya = await read("maya");
    expect([maya.lines.length, maya.partial]).toEqual([MAX_LINES, false]);
  }, 240_000);
});
