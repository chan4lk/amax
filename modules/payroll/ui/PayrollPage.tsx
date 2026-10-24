import type { ScreenProps } from "@amax/core";
import { PinButton } from "@amax/ui";
import { viewPin } from "../pins";
import { currentRun, getPayslip, getRun, listRuns, type RunView } from "../server/queries";
import { Changes } from "./Changes";
import { CostCentres, MoneyCards } from "./Money";
import { NextStep } from "./NextStep";
import { needViewer, plural, SignInFirst } from "./parts";
import { PayslipDrawer } from "./PayslipDrawer";
import { Payslips } from "./Payslips";
import { Steps } from "./Steps";
import { Tiles } from "./Tiles";

function lede(run: RunView) {
  const checked = run.steps[1].state === "done";
  const open = run.open ? `People decide: ${plural(run.open, "change is", "changes are")} still open${(run.changes ?? []).some((c) => c.needsCheck && c.status !== "accepted") ? ", and one needs a check before anything is deducted" : ""}.` : "Every change is decided.";
  return checked ? `The payroll agent checked ${plural(run.headcount, "payslip")} against ${run.previousLabel.split(" ")[0]} and explained every change. ${open}` : `${plural(run.headcount, "payslip")} drafted from HR, leave and time; the agent check is next.`;
}

function RunPicker({ runs, at }: { runs: RunView[]; at: string }) {
  if (runs.length < 2) return null;
  return (
    <nav className="seg" aria-label="Payroll runs">
      {runs.map((r) => <a key={r.id} href={`/payroll?run=${r.id}`} aria-current={r.id === at ? "page" : undefined}>{r.periodLabel.split(" ")[0].slice(0, 3)} {r.entityName.split(" ").slice(0, 3).join(" ")}</a>)}
    </nav>
  );
}

// 014 T1: the run's steps lead, then its totals and what needs a decision (changes since last period),
// then where the money goes and the payslips. Every row and tile is pinned; there are no forms.
export async function PayrollPage({ viewer: raw, searchParams }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Payroll</h1><SignInFirst /></>;
  const [runs, run] = await Promise.all([listRuns(viewer), searchParams?.run ? getRun(viewer, searchParams.run) : currentRun(viewer)]);
  if (!run) return <div className="payroll"><h1>Payroll</h1><div className="card pinnable"><PinButton pin={viewPin("Payroll runs")} /><p className="empty-line">No payroll run you can see yet. Payroll drafts one through amax.</p></div></div>;
  const slip = searchParams?.slip ? await getPayslip(viewer, searchParams.slip) : null;
  return (
    <div className="payroll">
      <div className="row head">
        <div><h1>{run.periodLabel.split(" ")[0]} payroll, {run.entityName}</h1><p className="lede">{lede(run)}</p>
          {run.pack?.fictional && <span className="chip warn">{run.pack.label}: demo figures only</span>}</div>
        <div className="actions"><RunPicker runs={runs} at={run.id} />{run.level !== "pay" && <NextStep run={run} />}</div>
      </div>
      <Steps run={run} />
      <Tiles run={run} />
      <div className="stack">
        {run.changes && <Changes run={run} />}
        {run.money && <MoneyCards run={run} />}
        {run.money && run.level === "totals" && <CostCentres run={run} />}
      </div>
      {run.payslips && <div className="gap"><Payslips run={run} /></div>}
      {run.money && run.level === "pay" && <div className="gap"><CostCentres run={run} /></div>}
      {slip && <PayslipDrawer s={slip} close={`/payroll?run=${run.id}`} />}
      <p className="src">Drafted from: <Sources s={run.sources} />.</p>
    </div>
  );
}

// 071 AC-2: a time read that missed people is a warning chip, not a plain line.
function Sources({ s }: { s: RunView["sources"] }) {
  const { timeIncomplete, ...lines } = s;
  const text = Object.entries(lines);
  return <>{text.map(([k, v], i) => <span key={k}>{i ? ". " : ""}{k === "time" && timeIncomplete ? <span className="chip warn">{v}</span> : v}</span>)}</>;
}
