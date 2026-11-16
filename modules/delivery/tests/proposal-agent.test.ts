import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants, type Viewer } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { acceptSuggestion, setSuggestionKinds, undoSuggestion } from "@amax/agents/server";
import delivery from "../module";
import { EVENTS } from "../contracts";
import { proposalAgent } from "../server/agent";
import { ctxFor } from "../server/context";
import { addProposalTask, updateProposal, withdrawProposal } from "../server/lifecycle";
import { proposalKinds } from "../server/proposal-kinds";
import { linkIdentity } from "../suggestions";
import { createProposal, moveProposal } from "../server/services";
import { markTaskDone } from "../server/tasks";
import { needsOf } from "../server/attention";
import { proposalOffers } from "../server/pin-offers";
import { updateCard } from "../server/proposal-card";
import { getProposal } from "../server/queries";
import { ProjectPage } from "../ui/ProjectPage";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb, T } from "./proposal-db";

describe.skipIf(!hasDb)("081 amendment 2: the Delivery agent suggests, a person decides (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    setGrants([delivery, agentsPlatform as never]);
    setSuggestionKinds([linkIdentity, ...proposalKinds]);
    maya = await db.as("maya");
  }, 120_000);
  afterAll(() => db?.t.drop());

  // The agent reads Delivery's outbox as the platform does: every event since the last call, through its handlers.
  let seen = 0;
  const runAgent = async () => {
    const events = await db.q(sql`select id, name, payload from core.event where name like 'delivery.%' order by created_at, id`);
    for (const e of events.slice(seen)) {
      for (const h of proposalAgent.filter((x) => x.event === e.name)) await withTenant(db.app, T, (tx) => h.handle({ tx, tenantId: T, event: { id: e.id as string, name: e.name as string, payload: e.payload as Record<string, unknown> } }));
    }
    seen = events.length;
  };
  const suggestions = (key: string, kind: string) => db.q(sql`select s.id, s.status, s.title from agents.suggestion s join delivery.proposal p on p.id::text = s.target_id
    where p.key = ${key} and s.kind = ${kind} order by s.created_at`);
  const phase = async (key: string) => (await db.row(key)).phase as string;
  const building = async (title: string, tasks = 2) => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title });
    for (let i = 0; i < tasks; i++) await addProposalTask(ctxFor(maya), { key, title: `Step ${i + 1}` });
    for (const to of ["planned", "building"] as const) await moveProposal(ctxFor(maya), { key, to });
    return key;
  };
  const decide = contextForViewer;

  it("AC32 the last task of a Building proposal raises Ready to verify; accepting moves it, undo moves it back", async () => {
    const key = await building("Dunning emails");
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    await runAgent();
    expect(await suggestions(key, "delivery.proposal-verify")).toEqual([]);
    await markTaskDone(ctxFor(maya), { key, task: "T2" });
    await runAgent();
    await runAgent();
    const [s] = await suggestions(key, "delivery.proposal-verify");
    expect(s).toMatchObject({ status: "open", title: `Move ${key} to Verified` });
    expect((await suggestions(key, "delivery.proposal-verify")).length).toBe(1);

    await expect(acceptSuggestion(decide(await db.as("kasun"), "chat"), { id: s.id as string })).rejects.toThrow();
    await acceptSuggestion(decide(maya, "chat"), { id: s.id as string });
    expect(await phase(key)).toBe("verified");
    expect(await db.q(sql`select payload->>'to' as to, payload->>'ownerUserId' as owner from core.event where name = ${EVENTS.proposalPhaseChanged} and payload->>'key' = ${key} order by created_at desc limit 1`))
      .toEqual([{ to: "verified", owner: maya.userId }]);
    await undoSuggestion(decide(maya, "chat"), { id: s.id as string });
    expect(await phase(key)).toBe("building");
  });

  it("AC33 a task closed on an ownerless proposal raises Suggested owner; it is refused once someone else owns it; undo clears it", async () => {
    const key = await building("Credit notes", 1);
    await db.t.owner`update delivery.proposal set owner_user_id = null, owner_name = null where key = ${key}`;
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    await runAgent();
    const [s] = await suggestions(key, "delivery.proposal-owner");
    expect(s).toMatchObject({ status: "open", title: `Make Maya Fernando the owner of ${key}` });

    await updateProposal(ctxFor(maya), { key, ownerUserId: (await db.as("nimal")).userId });
    await expect(acceptSuggestion(decide(maya, "chat"), { id: s.id as string })).rejects.toThrow(/has an owner now \(Nimal Silva\); nothing was changed/);
    expect((await db.row(key)).owner_name).toBe("Nimal Silva");

    await db.t.owner`update delivery.proposal set owner_user_id = null, owner_name = null where key = ${key}`;
    await acceptSuggestion(decide(maya, "chat"), { id: s.id as string });
    expect(await db.row(key)).toMatchObject({ owner_user_id: maya.userId, owner_name: "Maya Fernando" });
    await undoSuggestion(decide(maya, "chat"), { id: s.id as string });
    expect((await db.row(key)).owner_user_id).toBeNull();
  });

  // 087 AC-1: one "has no owner" rule. The Unassigned chip, the pin's "Make me the owner", the agent's Suggested owner and
  // its accept guard agree on every row; a name alone is an owner, so nothing replaces it.
  it.each([
    ["a user and a name", true, true, false],
    ["a name only", false, true, false],
    ["a user only", true, false, false],
    ["neither", false, false, true],
  ])("087 AC1 a proposal with %s: unowned is %s/%s → %s, everywhere", async (_label, withUser, withName, unowned) => {
    const key = await building(`Owner rule ${String(withUser)} ${String(withName)}`, 2);
    const state = () => db.t.owner`update delivery.proposal set owner_user_id = ${withUser ? maya.userId : null}, owner_name = ${withName ? "Maya Fernando" : null} where key = ${key}`;
    await db.t.owner`update delivery.proposal set owner_user_id = null, owner_name = null where key = ${key}`;
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    await runAgent();
    const [s] = await suggestions(key, "delivery.proposal-owner");
    await state();
    const row = (await getProposal(maya, { key }))!;
    expect(needsOf(row, new Set()).includes("unassigned")).toBe(unowned);
    // Review round 2: the screens use the same rule. A user with no stored name shows that user's name.
    const render = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
    const page = await render(ProposalsPage({ viewer: maya, params: { phase: key } }));
    expect(page.includes('<span class="chip warn">Unassigned</span>')).toBe(unowned);
    if (!unowned) expect(page).toContain("<b>Maya Fernando</b>");
    const list = await render(ProposalsPage({ viewer: maya, params: {}, searchParams: { q: key } }));
    expect(list.includes('<td data-label="Owner"><span class="muted">Unassigned</span>')).toBe(unowned);
    // Review round 3: the board's card and the update card's From line read the same rule and name.
    const board = await render(ProjectPage({ viewer: maya, params: { key: "CON" } }));
    const link = `href="/delivery/proposals/${key}"`;
    const after = board.slice(board.indexOf(link) + link.length);
    const card = after.slice(0, after.indexOf('href="/delivery/proposals/') === -1 ? after.length : after.indexOf('href="/delivery/proposals/'));
    expect(card.includes('"Unassigned"')).toBe(unowned);
    if (!unowned) expect(card).toContain('"Maya Fernando"');
    const from = (await updateCard(maya, { key, ownerUserId: (await db.as("nimal")).userId })).lines.find((l) => l.label === "From")!.value;
    expect(from).toBe(unowned ? "Unassigned" : "Maya Fernando");
    // With every task done the pin's three offers are Move, Log time and the owner one (with a task open, it's fourth).
    await markTaskDone(ctxFor(maya), { key, task: "T2" });
    await runAgent();
    expect((await proposalOffers(maya, { key })).some((o) => o.label.startsWith("Make me the owner"))).toBe(unowned);
    if (!unowned) expect((await suggestions(key, "delivery.proposal-owner")).filter((x) => x.id !== s.id)).toEqual([]);
    const accepted = await acceptSuggestion(decide(maya, "chat"), { id: s.id as string }).then(() => true, () => false);
    expect(accepted).toBe(unowned);
    if (!withUser && withName) expect((await db.row(key)).owner_name).toBe("Maya Fernando");
  });

  it("AC34 a suggestion that no longer fits is withdrawn, or refused at accept with nothing written", async () => {
    const moved = await building("Late fees", 1);
    await markTaskDone(ctxFor(maya), { key: moved, task: "T1" });
    await runAgent();
    await moveProposal(ctxFor(maya), { key: moved, to: "planned" });
    await runAgent();
    expect((await suggestions(moved, "delivery.proposal-verify")).map((s) => s.status)).toEqual(["dismissed"]);

    const gone = await building("Old idea", 1);
    await db.t.owner`update delivery.proposal set owner_user_id = null, owner_name = null where key = ${gone}`;
    await markTaskDone(ctxFor(maya), { key: gone, task: "T1" });
    await runAgent();
    await withdrawProposal(ctxFor(maya), { key: gone, reason: "Client dropped it" });
    await runAgent();
    expect([...(await suggestions(gone, "delivery.proposal-verify")), ...(await suggestions(gone, "delivery.proposal-owner"))].map((s) => s.status)).toEqual(["dismissed", "dismissed"]);

    const quiet = await building("Statements", 1);
    await markTaskDone(ctxFor(maya), { key: quiet, task: "T1" });
    await runAgent();
    const [s] = await suggestions(quiet, "delivery.proposal-verify");
    await db.t.owner`update delivery.proposal set phase = 'planned' where key = ${quiet}`;
    await expect(acceptSuggestion(decide(maya, "chat"), { id: s.id as string })).rejects.toThrow(/is planned now, not Building; nothing was changed/);
    expect(await phase(quiet)).toBe("planned");
    expect((await suggestions(quiet, "delivery.proposal-verify"))[0].status).toBe("open");
  });

  it("AC34 out of order: an older phase event delivered after the last task closed doesn't take back a suggestion that still fits", async () => {
    await runAgent();
    const key = await building("Out of order", 1);
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    // One tick can hand the agent these newest first (found in the 081 walk-through): the task closed, then the moves.
    const events = await db.q(sql`select id, name, payload from core.event where name like 'delivery.%' and payload->>'key' = ${key} order by created_at desc, id desc`);
    for (const e of events) for (const h of proposalAgent.filter((x) => x.event === e.name)) {
      await withTenant(db.app, T, (tx) => h.handle({ tx, tenantId: T, event: { id: e.id as string, name: e.name as string, payload: e.payload as Record<string, unknown> } }));
    }
    seen += events.length;
    expect((await suggestions(key, "delivery.proposal-verify")).map((s) => s.status)).toEqual(["open"]);
  });

  it("AC35 the proposal page leads with the agent's suggestion and the board card flags it, for those who may decide; accepted, it offers undo", async () => {
    const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);
    const key = await building("Reminders", 1);
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    await runAgent();
    const [s] = await suggestions(key, "delivery.proposal-verify");
    const page = await html(ProposalsPage({ viewer: maya, params: { phase: key } }));
    expect(page).toContain("Suggested by amax");
    expect(page).toContain(`data-ask="Accept the suggestion &quot;Move ${key} to Verified&quot; (suggestion id ${s.id as string})"`);
    expect(page).toContain(`aria-label="Dismiss Move ${key} to Verified"`);
    expect(page.indexOf("Suggested by amax")).toBeLessThan(page.indexOf(">Time</h2>"));
    expect(await html(ProjectPage({ viewer: maya, params: { key: "CON" } }))).toContain(`aria-label="amax suggests something for ${key}: open it"`);
    for (const who of [await db.as("maya", "Leadership"), await db.as("kasun")]) {
      expect(await html(ProposalsPage({ viewer: who, params: { phase: key } }).catch(() => ""))).not.toContain("Suggested by amax");
    }
    await acceptSuggestion(decide(maya, "chat"), { id: s.id as string });
    const after = await html(ProposalsPage({ viewer: maya, params: { phase: key } }));
    expect(after).toContain(`data-ask="Undo the suggestion &quot;Move ${key} to Verified&quot; (suggestion id ${s.id as string})"`);
    expect(after).not.toContain("Ask amax to accept");
    expect(await html(ProjectPage({ viewer: maya, params: { key: "CON" } }))).not.toContain(`amax suggests something for ${key}`);
  });
});
