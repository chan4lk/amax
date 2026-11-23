import type { Viewer } from "@amax/auth";
import { seesEveryone } from "./roster";
import { getDeliveryPulse } from "./pulse";
import { read, settingsOf } from "./read";
import { getReport } from "./view";
import { ExportRefused, type ExportData, type ExportScope, type ReportKind } from "./export-types";
import { joined, narrow, peopleNamed, projectOf, teamOf } from "./export-scope";
import { needs, noPulse, planOf } from "./export-plan";
import { monthOfDay, shortDay } from "./days";

export { KINDS, ExportRefused } from "./export-types";
export type { ExportData, ExportScope, Plan, ReportKind } from "./export-types";

const TITLES: Record<ReportKind, string> = { utilisation: "Utilisation", availability: "Availability", delivery: "Delivery" };

export async function exportData(v: Viewer, scope: ExportScope, month?: string, today = new Date(), kind: ReportKind = "utilisation", heading?: string, sections?: readonly string[]): Promise<ExportData> {
  const want = needs(kind, sections);
  const asked = scope.people?.length ? scope.people : scope.person ? [scope.person] : [];
  const named = asked.length ? await peopleNamed(v, asked) : [];
  let only: Set<string> | undefined = asked.length ? new Set(named.flatMap((n) => (n.id ? [n.id] : []))) : undefined;
  let project: { ref: { id: string; name: string } } | null = null;
  if (scope.project) {
    const m = month ?? monthOfDay((await read(v, (tx) => settingsOf(tx))).today);
    const found = await projectOf(v, m, scope.project);
    project = { ref: found.ref };
    only = found.people;
  }
  const r = await getReport(v, month, undefined, { only, parts: want.parts }).catch(async (e: unknown) => {
    if (month && e instanceof Error && /hasn't started yet/.test(e.message)) {
      const now = await getReport(v, undefined, undefined, { only: new Set(), parts: { trend: false, heat: false, availability: false } });
      throw new ExportRefused(`${e.message}. Reports' latest month is ${now.monthName} ${now.month.slice(0, 4)}: ask for that month, or leave the month out.`);
    }
    throw e;
  });
  for (const n of named) {
    if (!n.id || !r.rows.some((x) => x.personId === n.id)) throw new ExportRefused(`You can't see a report for "${n.name}" in ${r.monthName}.`);
  }
  if (project && !r.rows.length) throw new ExportRefused(`You can't see anyone on ${project.ref.name} in ${r.monthName}.`);
  const label = project ? project.ref.name : named.length ? joined(r.rows.map((x) => x.name)) : null;
  const rows = r.rows;
  const team = label ? teamOf(rows, r.team) : r.team;
  const base = want.pulse ? await getDeliveryPulse(v, r) : noPulse(r);
  const pulse = label ? narrow(base, rows, team, project?.ref.id ?? null) : base;
  return {
    title: `${heading ?? `${TITLES[kind]} report`}${label && !(heading ?? "").includes(label) ? `: ${label}` : ""}, ${r.monthName} ${r.month.slice(0, 4)}`, kind,
    window: r.availability.range ? `${shortDay(r.availability.range.from)} to ${shortDay(r.availability.range.to)}` : "the rest of the month",
    availability: r.availability.rows.filter((x) => rows.some((y) => y.userId === x.userId)), range: r.availability.range, period: kind === "availability" && r.availability.range ? `${shortDay(r.availability.range.from)} – ${shortDay(r.availability.range.to)}` : r.span, month: r.month,
    madeFor: v.name, madeOn: today.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    target: r.target, briefing: pulse.briefing, trend: r.trend, rows, team, pulse, plan: want.plan ? await planOf(v, r, rows) : null,
    free: r.availability.allocationsOn ? Math.round(r.availability.rows.filter((x) => rows.some((y) => y.userId === x.userId)).reduce((n, x) => n + (x.freeHours ?? 0), 0) * 10) / 10 : null,
    scope: label ?? (seesEveryone(v) ? "Everyone" : "Your people"),
  };
}
