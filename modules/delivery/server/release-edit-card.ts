import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "@amax/db";
import { can, type Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { getRuntime } from "@amax/core/server";
import { ToolError } from "@amax/mcp";
import { FIELDS } from "./release-card";
import { CATEGORIES, CategoryInput, categoryLabel } from "./release-status";
import { categoryProblem, datesProblem, missingForTracking, notTrackedYet } from "./release-tracking";

export const ReleaseEditDraft = z.object({ projectKey: z.string(), version: z.string().trim(), name: z.string().trim().optional(), category: z.string().trim().toLowerCase().optional(),
  startDate: z.string().trim().optional(), targetDate: z.string().trim().optional() });
type Draft = z.infer<typeof ReleaseEditDraft>;

const fail = (message: string, field?: string) => new ToolError(message, "invalid_input", field);
const stored = (tx: Tx, a: Draft) => tx.execute(sql`select r.name, r.version, r.category, r.status, r.start_date::text as start_date, r.target_date::text as target_date,
  p.id as project_id, p.key, p.name as project_name, p.legal_entity_id from delivery.release r join delivery.project p on p.id = r.project_id
  where p.key = ${a.projectKey} and r.version = ${a.version}`).then((rows) => rows[0]);

export async function releaseEditCard(v: Viewer, a: Draft): Promise<ToolCard> {
  const r = await withTenant(getRuntime().db, v.tenantId, (tx) => stored(tx, a));
  const name = a.name ?? (r?.name as string | undefined) ?? a.version;
  const look = { kind: "Edit a release", confirm: "Save", done: `Updated ${name} (${a.version})` };
  if (!r) return { title: `Edit ${a.projectKey} ${a.version}`, lines: [], look };
  const kept = (k: string) => ((r[k] as string | null) ?? undefined);
  const value = (k: string, given?: string) => given ?? kept(k);
  return {
    title: `Edit ${a.projectKey} ${a.version} · ${name}`, lines: [], look,
    form: { fields: [
      { name: "name", label: "Name", kind: "text", value: value("name", a.name) },
      { name: "category", label: "Category", kind: "chips", value: value("category", a.category), options: CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c)! })) },
      { name: "startDate", label: "Start (YYYY-MM-DD)", kind: "text", value: value("start_date", a.startDate) },
      { name: "targetDate", label: "Target (YYYY-MM-DD)", kind: "text", value: value("target_date", a.targetDate) },
    ], confirm: { label: "Save" } },
  };
}

export const proposeReleaseEdit = (v: Viewer, a: Draft) => withTenant(getRuntime().db, v.tenantId, async (tx) => {
  const r = await stored(tx, a);
  if (!r) throw fail(`${a.projectKey} has no release ${a.version}`);
  if (!can(v, "delivery:release:create", { projectId: r.project_id as string })) throw fail(`You can't change releases in ${a.projectKey}`);
  if (r.status === "completed") throw fail(`${a.projectKey} ${a.version} is completed; it can't change`);
  for (const [field, schema] of FIELDS) {
    const checked = field === "version" || a[field] === undefined ? null : schema.safeParse(a[field]);
    if (checked && !checked.success) throw fail(checked.error.issues[0].message, field);
  }
  const d = { category: a.category ?? (r.category as string | null), start: a.startDate ?? (r.start_date as string | null), target: a.targetDate ?? (r.target_date as string | null) };
  const missing = missingForTracking(r, a);
  if (missing) throw fail(notTrackedYet(a.projectKey, a.version), missing);
  const order = d.start && d.target ? datesProblem(d.start, d.target) : null;
  if (order) throw fail(order, "targetDate");
  const noEnv = d.category ? await categoryProblem(tx, { id: r.project_id, key: r.key }, CategoryInput.parse(d.category)) : null;
  if (noEnv) throw fail(noEnv, "category");
});
