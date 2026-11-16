import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { ctxFor } from "../server/context";
import { addProposalTask, withdrawProposal } from "../server/lifecycle";
import { createProposal } from "../server/services";
import { markTaskDone } from "../server/tasks";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb } from "./proposal-db";

const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);

describe.skipIf(!hasDb)("081 amendment 4: the proposal page (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  const page = (key: string, v = maya) => html(ProposalsPage({ viewer: v, params: { phase: key } }));
  beforeAll(async () => { db = await proposalDb(); maya = await db.as("maya"); }, 120_000);
  afterAll(() => db?.t.drop());

  it("AC46 AC47 the header has Ask amax and Withdraw only; the stepper says the phase once, the facts line no longer does", async () => {
    const p = await page("CON-017");
    const actions = p.slice(p.indexOf('<div class="actions">'), p.indexOf("dv-steps-card"));
    expect([...actions.matchAll(/<button[^>]*>/g)].map((m) => m[0].match(/aria-label="([^"]+)"/)?.[1] ?? "")).toEqual(expect.arrayContaining(["Withdraw CON-017"]));
    expect(actions).not.toMatch(/Edit CON-017|Move CON-017|Add a task to CON-017/);
    expect(p).toMatch(/<ol class="dv-steps" aria-label="CON-017 stage: Proposed">/);
    expect(p).toMatch(/<li class="current" aria-current="step">/);
    // The facts: project, owner, made and updated, each a label over its name or date, and no phase chip.
    const facts = p.slice(p.indexOf('<dl class="dv-facts">'), p.indexOf("</dl>"));
    expect([...facts.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1])).toEqual(["Project", "Owner", "Made by hand", "Updated"]);
    expect(facts).toMatch(/<dt>Made by hand<\/dt><dd><b><time dateTime="[^"]+">[A-Z][a-z]{2} \d{1,2}<\/time><\/b>/);
    expect(facts).not.toMatch(/Proposed|Building|chip agent/);
    // Suggestions (when any) and every card come after the stepper.
    expect(p.indexOf("dv-steps-card")).toBeLessThan(p.indexOf("dv-time"));
  });

  it("AC49 AC51 Time reads as a band; open tasks lead and the done ones fold, open once all are done", async () => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Statements", estimateHours: 4 });
    await addProposalTask(ctxFor(maya), { key, title: "Template" });
    await addProposalTask(ctxFor(maya), { key, title: "Totals" });
    await db.t.owner`update delivery.proposal set hours = 5 where key = ${key}`;
    let p = await page(key);
    expect(p).toMatch(/<div class="bar" role="img" aria-label="5 h approved of 4 h estimated, 1 h over">/);
    expect(p).toContain("1 h over the estimate");
    expect(p).toContain("2 open");
    expect(p).not.toContain("dv-done");
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    p = await page(key);
    expect(p).toMatch(/<details class="dv-fold dv-done"><summary><span class="chip good">1 done<\/span>/);
    await markTaskDone(ctxFor(maya), { key, task: "T2" });
    p = await page(key);
    expect(p).toMatch(/<details class="dv-fold dv-done" open=""><summary><span class="chip good">All 2 done<\/span>/);
    expect(p).toMatch(/<li class="task pinnable"><svg[^>]*>.*?<\/svg><span>T2 Totals done/);
   }, 30_000);

  it("AC47 a withdrawn proposal crosses out the step it was in", async () => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: "Dropped" });
    await withdrawProposal(ctxFor(maya), { key, reason: "not needed" });
    const p = await page(key);
    expect(p).toMatch(/aria-label="[^"]+ stage: Proposed, withdrawn"/);
    expect(p).toMatch(/<li class="withdrawn"><svg[^>]*>.*?<\/svg><b>Proposed<\/b><small>Withdrawn<\/small>/);
   }, 30_000);
});
