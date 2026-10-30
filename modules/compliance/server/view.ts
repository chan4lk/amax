import type { Viewer } from "@amax/auth";
import { personIdsForUser } from "@amax/hr/contracts";
import { read, ACKNOWLEDGE, iso, day, type Row } from "./context";
import { bundleState } from "./evidence";
import { policyCoverage, policyStatusFor } from "./policy-read";
import { byId, openRisks, toIncident, toRisk } from "./registers";
import { platformSuppliers, registerSuppliers, toSupplier } from "./supplier-read";

export const getIncident = (v: Viewer, id: string) => read(v, (tx) => byId(tx, "incident", id, toIncident));
export const getRisk = (v: Viewer, id: string) => read(v, (tx) => byId(tx, "risk", id, toRisk));
export const getSupplier = (v: Viewer, id: string) => read(v, (tx) => byId(tx, "supplier", id, toSupplier));
export const listRisks = (v: Viewer) => read(v, openRisks);
export const listSuppliers = (v: Viewer) => read(v, async (tx) => ({ platform: await platformSuppliers(tx), register: await registerSuppliers(tx, true) }));

/** One policy version: its acknowledgement rate and, if it is current, who still has to acknowledge it. */
export const getPolicy = (v: Viewer, id: string) => read(v, async (tx) => {
  const current = (await policyCoverage(tx, v.tenantId)).policies.find((p) => p.id === id);
  if (current) return { ...current, current: true };
  return byId(tx, "policy", id, (r: Row) => ({ id: r.id as string, key: r.key as string, title: r.title as string, version: Number(r.version), publishedOn: day(r.published_on), current: false }));
});

export const getEvidenceBundle = (v: Viewer, id: string) => read(v, (tx) => byId(tx, "evidence_bundle", id, (r: Row) => ({
  id: r.id as string, control: r.control as string, title: r.title as string, periodFrom: day(r.period_from), periodTo: day(r.period_to), generatedAt: iso(r.generated_at),
  generatedBy: r.generated_by as string, digest: r.digest as string, signature: r.signature as string, ...bundleState(r), contents: r.contents,
})));

/** The viewer's own current policies, and which they still have to acknowledge. */
export const myPolicies = (v: Viewer) => read(v, async (tx) => {
  const [personId] = await personIdsForUser(tx, v.userId);
  return personId ? policyStatusFor(tx, { kind: "viewer", viewer: v }, v.tenantId, personId) : [];
}, ACKNOWLEDGE);
