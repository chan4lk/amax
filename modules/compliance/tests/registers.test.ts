import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRegistry } from "@amax/mcp";
import { EVENTS } from "../contracts";
import { contextFor } from "@amax/core/server";
import { withTenant } from "@amax/db";
import { applyRule } from "@amax/core/privacy";
import { remindBreaches } from "../server/reminders";
import { complianceDb, T } from "./db";

type Db = Awaited<ReturnType<typeof complianceDb>>;
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!hasDb)("compliance registers (Postgres)", () => {
  let db: Db;
  let call: (who: string, tool: string, args: object) => Promise<Any>;
  beforeAll(async () => {
    db = await complianceDb();
    const registry = createRegistry(db.modules);
    call = async (who, tool, args) => registry.call(await db.as(who), tool, args, { source: "mcp" }) as Promise<Any>;
  }, 240_000);
  afterAll(() => db?.t.drop());

  it("AC1 a new policy version asks everyone in scope to acknowledge it again; a person acknowledges their own", async () => {
    const o = await call("sahan", "get_compliance_overview", {});
    expect(o.coverage).toMatchObject({ people: 184, fullyAcknowledged: 167 });
    expect(o.coverage.policies.map((p: Any) => [p.title, p.version, p.pending])).toEqual([["Acceptable Use", 4, 17], ["Information Security", 7, 0], ["Privacy Notice for staff", 2, 0]]);
    const v8 = await call("sahan", "publish_policy", { title: "Information Security", summary: "v8 (fictional)", key: "information-security" });
    expect(v8).toMatchObject({ version: 8, inScope: 184 });
    expect((await db.events(EVENTS.acknowledgementRequested)).filter((e) => e.version === 8)).toHaveLength(v8.asked);
    const mine = await call("dinesh", "get_my_policies", {});
    expect(mine.filter((p: Any) => !p.acknowledged).map((p: Any) => `${p.title} v${p.version}`)).toEqual(["Acceptable Use v4", "Information Security v8"]);
    await call("dinesh", "acknowledge_policy", { policyId: v8.id });
    expect((await call("sahan", "get_policy", { policyId: v8.id })).acknowledged).toBe(1);
    await expect(call("dinesh", "get_compliance_overview", {})).rejects.toThrow(/forbidden|compliance:read/);
  }, 60_000);

  it("AC2 a personal-data breach gets its country pack's deadline, the owner is told, and reminders come daily in the last week", async () => {
    const lk = await call("nimal", "report_incident", { title: "Test CV shared in a public channel (fictional)", personalData: true, dataClass: "candidate", entity: "LK", owner: "Ravi Perera" });
    expect(lk).toMatchObject({ breach: true, status: "assessing" });
    expect(new Date(lk.notifyBy).getTime() - Date.now()).toBeGreaterThan(71.9 * 3_600_000);
    expect(new Date(lk.notifyBy).getTime() - Date.now()).toBeLessThan(72.1 * 3_600_000);
    expect((await db.events(EVENTS.breachFlagged)).at(-1)).toMatchObject({ incidentId: lk.id, regulator: "Data Protection Authority" });
    const au = (await call("sahan", "get_compliance_overview", {})).incidents.find((i: Any) => i.title === "Payslip emailed to the wrong person");
    expect(au).toMatchObject({ notifyBy: "2026-11-15T02:00:00.000Z", regulator: "OAIC" });
    const remind = (now: string) => remindBreaches(contextFor.job(T, "test"), { now });
    expect((await remind("2026-11-01T08:00:00Z")).reminded).toEqual([lk.ref]);
    expect((await remind("2026-11-10T08:00:00Z")).reminded).toContain(au.ref);
    expect((await remind("2026-11-10T09:00:00Z")).reminded).toEqual([]);
    expect((await db.events(EVENTS.breachDeadline)).find((e) => e.incidentId === au.id)).toMatchObject({ daysLeft: 5 });
  }, 60_000);

  it("AC3 the supplier register includes every subprocessor, including the AI provider configured in 033", async () => {
    await db.q(sql`insert into ai.settings (tenant_id, zdr_confirmed, ai_region) values (${T}, true, 'AU') on conflict (tenant_id) do update set ai_region = 'AU'`);
    const s = await call("ravi", "list_suppliers", {});
    expect(s.platform.map((x: Any) => [x.name, x.region])).toEqual([["Anthropic", "Australia"], ["Database host", null]]);
    expect(s.register.filter((x: Any) => x.subprocessor).map((x: Any) => x.name)).toContain("Northwind Payroll Bureau");
  }, 60_000);

  it("AC5 evidence export produces a dated, signed bundle per control that detects a changed byte", async () => {
    const out = await call("sahan", "export_evidence", {});
    expect(out.bundles.map((b: Any) => [b.control, b.available])).toEqual([["A.5.1", true], ["A.5.18", false], ["A.5.24", true], ["A.6.3", true], ["A.8.15", true]]);
    const bundle = await call("sahan", "get_evidence_bundle", { bundleId: out.bundles[2].id });
    expect(bundle).toMatchObject({ signatureValid: true, periodTo: out.period.to, contents: { control: "A.5.24", evidence: { incidents: expect.arrayContaining([expect.objectContaining({ title: "Laptop lost in transit" })]) } } });
    await db.t.owner`update compliance.evidence_bundle set contents = jsonb_set(contents, '{period,to}', '"2099-01-01"') where id = ${out.bundles[2].id}`;
    expect((await call("sahan", "get_evidence_bundle", { bundleId: out.bundles[2].id })).signatureValid).toBe(false);
  }, 60_000);

  // 070 review round 3: contents names people, so the module's own retention rule anonymises it, through the
  // privacy engine's applyRule; the bundle then reads as anonymised, not tampered, and the others are untouched.
  it("an anonymised bundle reads as anonymised, never as valid or tampered; the rest still verify", async () => {
    const out = await call("sahan", "export_evidence", {});
    const [gone, kept] = [out.bundles[0].id, out.bundles[3].id];
    const rule = db.modules.find((m) => m.id === "compliance")!.retention!.find((r) => r.table === "compliance.evidence_bundle")!;
    expect(rule.fields).toEqual(expect.arrayContaining(["generated_by", "contents"]));
    await withTenant(db.app, T, (tx) => applyRule(tx, { ...rule, id: "t", module: "compliance" }, sql`id = ${gone}`));
    expect(await call("sahan", "get_evidence_bundle", { bundleId: gone })).toMatchObject({ anonymised: true, signatureValid: null, contents: {} });
    expect(await call("sahan", "get_evidence_bundle", { bundleId: kept })).toMatchObject({ anonymised: false, signatureValid: true });
    // Review round 4: contents emptied without the retention rule (generated_by untouched) is tampering, not anonymised.
    await db.t.owner`update compliance.evidence_bundle set contents = '{}'::jsonb where id = ${kept}`;
    expect(await call("sahan", "get_evidence_bundle", { bundleId: kept })).toMatchObject({ anonymised: false, signatureValid: false });
  }, 60_000);
});
