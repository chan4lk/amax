import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { EventHandlerDef } from "@amax/core";
import { hoursCorrectedHandler, hoursDeletedHandler, hoursHandler } from "../server/hours";
import type { Report } from "../server/view";
import { reportsDb, T } from "./db";

describe.skipIf(!hasDb)("070 reports keeps up with corrected and deleted time (Postgres)", () => {
  let db: Awaited<ReturnType<typeof reportsDb>>;
  beforeAll(async () => { db = await reportsDb(); }, 240_000);
  afterAll(() => db?.t.drop());

  const tharushi = async () => (await db.call<Report>("maya", "get_utilisation", {})).rows.find((x) => x.name === "Tharushi Wijesinghe");
  const copy = (id: string) => db.q(sql`select hours::float as hours, revision, deleted_at is not null as deleted from reports.logged_hours where entry_id = ${id}`);
  const deliver = (h: EventHandlerDef, payload: object) => db.tx((tx) => h.handle({ tx, tenantId: T, event: { id: randomUUID(), name: h.event, payload: payload as Record<string, unknown> } }));

  it("AC7 a correction replaces the copy, a delete tombstones it, and late, repeated or out-of-order events never bring back old hours", async () => {
    const { id } = await db.call<{ id: string }>("tharushi", "log_time", { projectKey: "FLT", day: "2026-10-16", hours: 4, billable: true });
    await db.tick();
    expect(await tharushi()).toMatchObject({ loggedHours: 4, billableHours: 4 });
    await db.call("tharushi", "correct_time_entry", { entryId: id, hours: 2.5 });
    await db.tick();
    expect(await copy(id)).toEqual([{ hours: 2.5, revision: 2, deleted: false }]);
    expect(await tharushi()).toMatchObject({ loggedHours: 2.5, billableHours: 2.5 });
    await db.call("tharushi", "delete_time_entry", { entryId: id });
    await db.tick();
    expect(await copy(id)).toEqual([{ hours: 2.5, revision: 3, deleted: true }]);
    expect(await tharushi()).toBeUndefined();

    const userId = (await db.as("tharushi")).userId;
    const base = { userId, day: "2026-10-15", projectId: randomUUID(), weekId: randomUUID(), lockedChange: false };
    const late = randomUUID();
    await deliver(hoursDeletedHandler, { ...base, entryId: late, hours: 3, revision: 2 });
    await deliver(hoursHandler, { ...base, entryId: late, hours: 3, billable: true, source: "person", revision: 1 });
    expect(await copy(late)).toEqual([{ hours: 3, revision: 2, deleted: true }]);
    const swapped = randomUUID();
    await deliver(hoursHandler, { ...base, entryId: swapped, hours: 1, billable: true, source: "person", revision: 1 });
    await deliver(hoursCorrectedHandler, { ...base, entryId: swapped, hours: 6, billable: true, revision: 3, before: { hours: 5, billable: true, projectId: base.projectId } });
    await deliver(hoursCorrectedHandler, { ...base, entryId: swapped, hours: 5, billable: true, revision: 2, before: { hours: 1, billable: true, projectId: base.projectId } });
    await deliver(hoursCorrectedHandler, { ...base, entryId: swapped, hours: 6, billable: true, revision: 3, before: { hours: 5, billable: true, projectId: base.projectId } });
    expect(await copy(swapped)).toEqual([{ hours: 6, revision: 3, deleted: false }]);
    expect(await tharushi()).toMatchObject({ loggedHours: 6, billableHours: 6 });
  }, 120_000);
});
