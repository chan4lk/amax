import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { listSuggestions } from "@amax/agents/server";
import type { RunStatus } from "../contracts";
import { changesOf, type ChangeRow } from "./changes";
import { amt, initialsOf, levelOf, monthLabel, named, prevMonth, type Level } from "./read";
import { packInfo, statutoryOf, type Statutory } from "./statutory";
import { nextOf, stepsOf, type NextStep, type StepView } from "./steps";
import { totalsByCostCentre, type CostCentreTotal, type Totals } from "./totals";

export type PayslipRow = { id: string; personId: string; personName: string; initials: string; employeeNo: string; costCentre: string; gross: string; deductions: string; net: string; flags: string[]; change: ChangeRow["status"] | null };
export type Money = {
  totals: Totals & { people: number }; previousGross: string | null; costCentres: CostCentreTotal[];
  breakdown: { label: string; amount: string }[]; trend: { period: string; label: string; gross: string }[];
};
export type RunView = {
  id: string; level: Level; payGroup: { id: string; name: string }; legalEntityId: string; entityName: string; currency: string;
  period: string; periodLabel: string; previousLabel: string; status: RunStatus; steps: StepView[]; headcount: number; sources: Record<string, string> & { timeIncomplete?: boolean };
  pack: Statutory["pack"]; statutory?: Statutory["statutory"]; filings?: Statutory["filings"]; money?: Money;
  changes?: ChangeRow[]; open: number; payslips?: PayslipRow[]; bankFile: { suggestionId: string; status: string; firstApprovedBy: string | null } | null; next: NextStep;
};

export const RUN = sql`select r.*, to_char(r.period, 'YYYY-MM') as month, g.name as group_name, e.name as entity_name,
    ${named("r.drafted_by")} as drafted_name, ${named("r.checked_by")} as checked_name, ${named("r.hr_approved_by")} as hr_name,
    ${named("r.finance_approved_by")} as finance_name, ${named("r.bank_file_by")} as bank_name, ${named("r.sent_by")} as sent_name,
    (select count(*) from payroll.payslip p where p.run_id = r.id)::int as headcount
  from payroll.run r join payroll.pay_group g on g.id = r.pay_group_id join core.legal_entity e on e.id = r.legal_entity_id`;

const shortLabel = (label: string) => label.replace(/,? \d+(\.\d+)?%$/, "").replace(/, \d+(\.\d+)? (h|days?)$/, "");

/** Totals, cost centres (folded for Finance), the six-month gross trend and where the money goes. */
async function moneyOf(tx: Tx, id: string, groupId: string, month: string, fold: boolean): Promise<Money> {
  const t = await totalsByCostCentre(tx, id, fold);
  const rows = await tx.execute(sql`select to_char(r.period, 'YYYY-MM') as month, coalesce((select sum(p.gross) from payroll.payslip p where p.run_id = r.id), 0) as gross
    from payroll.run r where r.pay_group_id = ${groupId} and r.period <= ${`${month}-01`} order by r.period desc limit 6`);
  const trend = rows.reverse().map((x) => ({ period: x.month as string, label: monthLabel(x.month as string).slice(0, 3), gross: amt(x.gross) }));
  const prev = trend.find((x) => x.period === prevMonth(month));
  const parts = await tx.execute(sql`select l.code, min(l.label) as label, sum(l.amount) as amount from payroll.payslip_line l join payroll.payslip s on s.id = l.payslip_id
    where s.run_id = ${id} and l.kind = 'deduction' group by l.code order by sum(l.amount) desc`);
  return { totals: t.total, costCentres: t.costCentres, trend, previousGross: prev?.gross ?? null, breakdown: [{ label: "Net pay", amount: t.total.net }, ...parts.map((x) => ({ label: shortLabel(x.label as string), amount: amt(x.amount) }))] };
}

async function payslipsOf(tx: Tx, runId: string, changes: ChangeRow[]): Promise<PayslipRow[]> {
  const slips = await tx.execute(sql`select * from payroll.payslip where run_id = ${runId} order by person_name`);
  return slips.map((s) => ({
    id: s.id as string, personId: s.person_id as string, personName: s.person_name as string, initials: initialsOf(s.person_name as string), employeeNo: s.employee_no as string,
    costCentre: s.cost_centre as string, gross: amt(s.gross), deductions: amt(s.deductions), net: amt(s.net), flags: (s.flags as string[]) ?? [],
    change: changes.find((c) => c.personId === s.person_id)?.status ?? null,
  }));
}

async function bankFileOf(v: Viewer, runId: string): Promise<RunView["bankFile"]> {
  const [s] = await listSuggestions(v, { kind: "payroll.bank-file", targetId: runId });
  return s ? { suggestionId: s.id, status: s.status, firstApprovedBy: s.firstApprovedBy?.name ?? null } : null;
}

/** 014 T1, T5: one run shaped by the viewer's level. Null when they may not see it. */
export async function view(tx: Tx, v: Viewer, r: Record<string, unknown>, full = true): Promise<RunView | null> {
  const level = levelOf(v, r.legal_entity_id as string);
  if (!level) return null;
  const month = r.month as string;
  const base = { id: r.id as string, legalEntityId: r.legal_entity_id as string, currency: r.currency as string, pack: r.pack as string, month, periodEnd: r.period_end };
  const pay = level !== "status";
  const s = pay ? await statutoryOf(tx, base) : null;
  const changes = level !== "totals" && full ? await changesOf(tx, v, base.id) : undefined;
  const [o] = await tx.execute(sql`select count(*)::int as n from payroll.change where run_id = ${base.id} and decision is null`);
  const out: RunView = {
    id: base.id, level, payGroup: { id: r.pay_group_id as string, name: r.group_name as string }, legalEntityId: base.legalEntityId, entityName: r.entity_name as string,
    currency: base.currency, period: month, periodLabel: monthLabel(month), previousLabel: monthLabel(prevMonth(month)), status: r.status as RunStatus, steps: stepsOf(r),
    headcount: Number(r.headcount), sources: (r.sources as Record<string, string> & { timeIncomplete?: boolean }) ?? {}, pack: packInfo(base.pack), statutory: s?.statutory, filings: s?.filings,
    money: pay && full ? await moneyOf(tx, base.id, r.pay_group_id as string, month, level === "totals") : undefined,
    changes, open: Number(o.n), payslips: level === "pay" && full ? await payslipsOf(tx, base.id, changes ?? []) : undefined,
    bankFile: full ? await bankFileOf(v, base.id) : null, next: null,
  };
  out.next = nextOf(v, { status: out.status, legalEntityId: out.legalEntityId }, out.open, `the ${monthLabel(month).split(" ")[0]} payroll run for ${out.entityName}`);
  return out;
}
