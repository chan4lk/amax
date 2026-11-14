import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { appendAudit, ForbiddenError } from "@amax/core/server";
import { ctxFor } from "../server/context";
import { proposalTimeLines } from "../server/proposal-lines";
import { T, timeDb } from "./db";

// 104 AC-11: the repo sync's draft (Delivery's audit of its own proposal) is a time line of the proposal's history, shown
// to the person it was drafted for and the project's approvers, as every time line is (081 AC-28).
describe.skipIf(!hasDb)("104 AC-11 a drafted-from-the-repo line", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  it("AC-11 the draft shows as a time line with its day, hours and commits, to its person and an approver; not to others", async () => {
    const nimal = await db.as("nimal");
    const [p] = await db.q(sql`select id, project_id from delivery.proposal where key = 'CON-014'`);
    const proposal = { id: p.id as string, projectId: p.project_id as string };
    const after = { proposalId: proposal.id, userId: nimal.userId, day: "2026-11-12", hours: 1.5, commits: 6 };
    await withTenant(db.app, T, (tx) => appendAudit(tx, ctxFor(nimal, "mcp"), { action: "delivery.commit_time.draft", resource: "delivery.proposal", resourceId: proposal.id, after }));
    const mine = await withTenant(db.app, T, (tx) => proposalTimeLines(tx, nimal, proposal));
    const line = mine.lines.find((l) => l.drafted);
    expect(line).toMatchObject({ userId: nimal.userId, day: "2026-11-12", hours: 1.5, drafted: 6, proposalId: proposal.id });
    const maya = await db.as("maya", "PM");
    expect((await withTenant(db.app, T, (tx) => proposalTimeLines(tx, maya, proposal, { line: line!.id }))).lines).toHaveLength(1);
    const liam = await db.as("liam");
    expect((await withTenant(db.app, T, (tx) => proposalTimeLines(tx, liam, proposal))).lines.some((l) => l.drafted)).toBe(false);
    await expect(withTenant(db.app, T, (tx) => proposalTimeLines(tx, liam, proposal, { line: line!.id }))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
