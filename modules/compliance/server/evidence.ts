import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { canonical, defineService, getRuntime } from "@amax/core/server";
import { ANONYMISED } from "@amax/core/privacy";
import { CONTROLS, EVENTS, type EvidenceExported } from "../contracts";
import { by, isoDate, type Row } from "./context";
import { PARTS } from "./evidence-parts";

const DAY = 86_400_000;
const sign = (body: string) => createHmac("sha256", getRuntime().auditKey).update(body).digest("hex");

/**
 * 070 review rounds 3 and 4: retention and erasure anonymise a bundle's contents (it names who generated it and the
 * people in its evidence) to {}, together with generated_by, which the same rule sets to ANONYMISED. Only both
 * together read as anonymised, with no signature verdict; contents emptied any other way is a failed signature.
 */
export function bundleState(r: Row): { anonymised: boolean; signatureValid: boolean | null } {
  const c = r.contents;
  const empty = typeof c === "object" && c !== null && !Array.isArray(c) && Object.keys(c).length === 0;
  const anonymised = empty && r.generated_by === ANONYMISED;
  return { anonymised, signatureValid: anonymised ? null : bundleVerifies(r) };
}

/** Whether a stored bundle's contents still match its digest and signature. */
export function bundleVerifies(r: Row) {
  const body = canonical(r.contents);
  const want = Buffer.from(sign(body), "hex"), got = Buffer.from(String(r.signature), "hex");
  return createHash("sha256").update(body).digest("hex") === r.digest && want.length === got.length && timingSafeEqual(want, got);
}

// One dated, signed bundle per control: the evidence as it stands, over the period (the last 12 months by default).
export const exportEvidence = defineService({
  name: "compliance.evidence.export", action: "compliance:manage", resource: "compliance.evidence_bundle",
  input: z.object({ controls: z.array(z.enum(CONTROLS)).optional().describe("ISO 27001 Annex A controls; all of them if left out"), from: isoDate.optional(), to: isoDate.optional() }),
  async run(tx, a, ctx) {
    const now = new Date();
    const period = { from: a.from ?? new Date(now.getTime() - 365 * DAY).toISOString().slice(0, 10), to: a.to ?? now.toISOString().slice(0, 10) };
    const bundles = [];
    for (const part of PARTS.filter((p) => !a.controls || a.controls.includes(p.control))) {
      const contents = { tenantId: ctx.tenantId, control: part.control, title: part.title, period, generatedAt: now.toISOString(), generatedBy: by(ctx), evidence: await part.build(tx, ctx.tenantId, period) };
      const body = canonical(contents);
      const [r] = await tx.execute(sql`insert into compliance.evidence_bundle (tenant_id, control, title, period_from, period_to, generated_at, generated_by, contents, digest, signature)
        values (${ctx.tenantId}, ${part.control}, ${part.title}, ${period.from}, ${period.to}, ${now.toISOString()}, ${by(ctx)}, ${body}::jsonb, ${createHash("sha256").update(body).digest("hex")}, ${sign(body)}) returning id, digest`);
      bundles.push({ id: r.id as string, control: part.control, title: part.title, digest: r.digest as string, available: contents.evidence.available !== false });
    }
    const events = bundles.map((b) => ({ name: EVENTS.evidenceExported, payload: { bundleId: b.id, control: b.control, periodFrom: period.from, periodTo: period.to, digest: b.digest, by: by(ctx) } satisfies EvidenceExported }));
    return { result: { period, generatedAt: now.toISOString(), bundles }, resourceId: bundles[0]?.id ?? null, after: { controls: bundles.map((b) => b.control), period }, events };
  },
});
