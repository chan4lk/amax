import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { getProposalRef, setProposalHours } from "@amax/delivery/contracts";
import { contextFor, ForbiddenError } from "@amax/core/server";
import { EVENTS } from "../contracts";
import { ctxFor } from "../server/context";
import { approveWeek } from "../server/decide";
import { lockProjectHours, PROPOSAL_HOURS_JOB, proposalHoursHandlers, refreshProposalHours } from "../server/proposal-hours";
import { reopenWeek } from "../server/reopen";
import { T, timeDb } from "./db";

describe.skipIf(!hasDb)("081 proposal hours (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const hours = async (key: string) => Number((await db.q(sql`select hours from delivery.proposal where key = ${key}`))[0].hours);
  const deliver = (event: string, payload: Record<string, unknown>) =>
    withTenant(db.app, T, async (tx) => { for (const h of proposalHoursHandlers.filter((x) => x.event === event)) await h.handle({ tx, tenantId: T, event: { id: randomUUID(), name: event, payload } }); });

  it("AC4 a proposal's hours are its approved entries: approving the week adds them, reopening it takes them away", async () => {
    const con014 = await withTenant(db.app, T, (tx) => getProposalRef(tx, "CON-014"));
    expect(con014).toMatchObject({ key: "CON-014", projectKey: "CON", withdrawn: false });
    expect(await hours("CON-014")).toBe(0);

    const ref = { person: "Nimal Silva", week: "2026-W42" };
    const weekId = (await db.q(sql`select id from time.week where person_name = 'Nimal Silva'`))[0].id as string;
    await approveWeek(ctxFor(await db.as("maya", "PM")), ref);
    await deliver(EVENTS.weekApproved, { weekId });
    expect([await hours("CON-014"), await hours("CON-011"), await hours("CON-012")]).toEqual([15.5, 0, 0]);

    const sahan = await db.as("sahan");
    await reopenWeek(ctxFor(sahan), { ...ref, reason: "Split Tuesday" });
    await deliver(EVENTS.weekReopened, { weekId });
    expect(await hours("CON-014")).toBe(0);
  });

  // Review round 1 (blocker): the write is Delivery's service, run as Time's job and audited by count, for every event
  // that refreshes the totals; an event that changes nothing still leaves its row, and none carries an hours value.
  it.each([
    ["a week approved", EVENTS.weekApproved, {}],
    ["a week reopened", EVENTS.weekReopened, {}],
    ["an approved week's entry changed", EVENTS.entryLogged, { lockedChange: true }],
  ])("review-1 %s: Delivery's service writes the hours, audited as the job", async (_label, event, extra) => {
    const weekId = (await db.q(sql`select id from time.week where person_name = 'Nimal Silva'`))[0].id as string;
    const before = Number((await db.q(sql`select count(*)::int as n from core.audit_event where action = 'delivery.proposal.hours'`))[0].n);
    await deliver(event, { weekId, ...extra });
    const rows = await db.q(sql`select actor, source, after from core.audit_event where action = 'delivery.proposal.hours' order by seq`);
    expect(rows.length).toBe(before + 1);
    const last = rows.at(-1)!;
    expect(last).toMatchObject({ actor: `job:${PROPOSAL_HOURS_JOB}`, source: "job" });
    expect(Object.keys(last.after as object).sort()).toEqual(["changed", "projects"]);
  });

  // Review round 2: only Time's job writes hours; a person, another job or one acting for someone is refused.
  it.each([
    ["another module's job", () => contextFor.job(T, "finance.time-agent")],
    ["a job acting for a person", () => contextFor.job(T, "delivery.ingest", "user:00000000-0000-4000-8000-000000000009")],
    ["a person", () => ({ tenantId: T, actor: { id: "user:00000000-0000-4000-8000-000000000009", kind: "user" as const }, source: "ui" as const })],
  ])("review-2 %s can't write a proposal's hours", async (_label, ctx) => {
    const project = (await db.q(sql`select project_id from delivery.proposal where key = 'CON-014'`))[0].project_id as string;
    await expect(setProposalHours(ctx(), { projectIds: [project], totals: {} })).rejects.toBeInstanceOf(ForbiddenError);
  });

  // Review round 1 (B7): a refresh that reads while another holds the project waits for it, so an older total can't land last.
  it("review-1 two refreshes of one project run one after the other", async () => {
    const project = (await db.q(sql`select project_id from delivery.proposal where key = 'CON-014'`))[0].project_id as string;
    let release!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const isLocked = new Promise<void>((r) => { locked = r; });
    const first = withTenant(db.app, T, async (tx) => { await lockProjectHours(tx, project); locked(); await held; });
    await isLocked;
    let secondDone = false;
    const second = withTenant(db.app, T, (tx) => refreshProposalHours(tx, T, [project])).then(() => { secondDone = true; });
    await new Promise((r) => setTimeout(r, 300));
    expect(secondDone).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(secondDone).toBe(true);
  });
});
