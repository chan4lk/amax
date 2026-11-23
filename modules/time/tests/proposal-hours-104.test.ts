import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { EVENTS } from "../contracts";
import { ctxFor } from "../server/context";
import { approveWeek } from "../server/decide";
import { proposalHoursHandlers } from "../server/proposal-hours";
import { reopenWeek } from "../server/reopen";
import { T, timeDb } from "./db";

// 104 AC-10: hours waiting for approval reach Delivery with the approved ones, through its hours service under Time's
// job, and move with every entry and week event.
describe.skipIf(!hasDb)("104 AC-10 hours waiting for approval (Postgres)", () => {
  let db: Awaited<ReturnType<typeof timeDb>>;
  beforeAll(async () => { db = await timeDb(); }, 60_000);
  afterAll(() => db?.t.drop());

  const figures = async (key: string) => (await db.q(sql`select hours::float as approved, waiting_hours::float as waiting from delivery.proposal where key = ${key}`))[0];
  const deliver = (event: string, payload: Record<string, unknown>) =>
    withTenant(db.app, T, async (tx) => { for (const h of proposalHoursHandlers.filter((x) => x.event === event)) await h.handle({ tx, tenantId: T, event: { id: randomUUID(), name: event, payload } }); });

  it("AC-10 a submitted week's hours wait; approving moves them to approved; reopening moves them back; every event refreshes under the job", async () => {
    const ref = { person: "Nimal Silva", week: "2026-W42" };
    const weekId = (await db.q(sql`select id from time.week where person_name = 'Nimal Silva'`))[0].id as string;
    expect(await figures("CON-014")).toEqual({ approved: 0, waiting: 0 });
    await deliver(EVENTS.entryLogged, { weekId });
    expect(await figures("CON-014")).toEqual({ approved: 0, waiting: 15.5 });
    await approveWeek(ctxFor(await db.as("maya", "PM")), ref);
    await deliver(EVENTS.weekApproved, { weekId });
    expect(await figures("CON-014")).toEqual({ approved: 15.5, waiting: 0 });
    await reopenWeek(ctxFor(await db.as("sahan")), { ...ref, reason: "Split Tuesday" });
    await deliver(EVENTS.weekReopened, { weekId });
    expect(await figures("CON-014")).toEqual({ approved: 0, waiting: 15.5 });
    expect(proposalHoursHandlers.map((h) => h.event).sort()).toEqual([EVENTS.entryCorrected, EVENTS.entryDeleted, EVENTS.entryLogged, EVENTS.weekApproved, EVENTS.weekRejected, EVENTS.weekReopened, EVENTS.weekSubmitted].sort());
    const [last] = await db.q(sql`select actor, after from core.audit_event where action = 'delivery.proposal.hours' order by seq desc limit 1`);
    expect(last).toMatchObject({ actor: "job:time.proposal-hours", after: { projects: expect.any(Number), changed: expect.any(Number) } });
  });
});
