import { sql } from "drizzle-orm";
import { z } from "zod";
import { defineService } from "@amax/core/server";
import { EVENTS, type HolidaySet, type TargetSet } from "../contracts";
import { asDay } from "./days";
import { settingsOf } from "./read";

const actor = (ctx: { actor: { id: string }; onBehalfOf?: string }) => (ctx.onBehalfOf ? `${ctx.actor.id} for ${ctx.onBehalfOf}` : ctx.actor.id);

export const setUtilisationTarget = defineService({
  name: "reports.target.set", action: "reports:target", resource: "reports.settings",
  input: z.object({ target: z.number().int().min(1).max(100).describe("The utilisation target, in percent") }),
  async run(tx, a, ctx) {
    const before = (await settingsOf(tx)).target;
    await tx.execute(sql`insert into reports.settings (tenant_id, target) values (${ctx.tenantId}, ${a.target}) on conflict (tenant_id) do update set target = excluded.target`);
    const payload: TargetSet = { target: a.target, by: actor(ctx) };
    return { result: { target: a.target }, resourceId: ctx.tenantId, before: { target: before }, after: { target: a.target }, events: [{ name: EVENTS.targetSet, payload }] };
  },
});

export const setHoliday = defineService({
  name: "reports.holiday.set", action: "reports:admin", resource: "reports.holiday",
  input: z.object({
    legalEntityId: z.uuid(), on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "give the day as YYYY-MM-DD"),
    name: z.string().min(1).max(80).nullable().describe("The holiday's name; null removes the day"),
  }),
  async run(tx, a, ctx) {
    const [entity] = await tx.execute(sql`select id from core.legal_entity where id = ${a.legalEntityId}`);
    if (!entity) throw Object.assign(new Error("no such legal entity"), { code: "not_found" });
    const [prior] = await tx.execute(sql`select name from reports.holiday where legal_entity_id = ${a.legalEntityId} and on_date = ${a.on}`);
    if (a.name === null) await tx.execute(sql`delete from reports.holiday where legal_entity_id = ${a.legalEntityId} and on_date = ${a.on}`);
    else await tx.execute(sql`insert into reports.holiday (tenant_id, legal_entity_id, on_date, name) values (${ctx.tenantId}, ${a.legalEntityId}, ${a.on}, ${a.name})
      on conflict (tenant_id, legal_entity_id, on_date) do update set name = excluded.name`);
    const payload: HolidaySet = { legalEntityId: a.legalEntityId, on: asDay(a.on), name: a.name, by: actor(ctx) };
    return { result: { legalEntityId: a.legalEntityId, on: a.on, name: a.name }, resourceId: a.legalEntityId,
      before: { name: (prior?.name as string | undefined) ?? null }, after: { name: a.name }, events: [{ name: EVENTS.holidaySet, payload }] };
  },
});
