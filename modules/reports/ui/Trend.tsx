import { PinButton } from "@amax/ui";
import { reportPin } from "../pins";
import { groupLabel } from "../server/roster";
import type { Report } from "../server/view";
import { AskButton } from "./AskButton";
import { TrendChart } from "./TrendChart";

export function Trend({ r, other }: { r: Report; other: Report }) {
  const pin = reportPin(`Utilisation, 12 months to ${r.monthName}, ${groupLabel(r.group).toLowerCase()}`, r.month, r.group);
  const now = groupLabel(r.group), then = groupLabel(other.group), pct = (x: Report) => (x.team.utilisation === null ? "no figure" : `${x.team.utilisation}%`);
  return (
    <section className="card pinnable">
      <div className="card-head">
        <h2>Utilisation, last 12 months</h2>
        <div className="actions">
          <span className="muted">{now} {pct(r)} · {then} {pct(other)} · Target {r.target}%</span>
          <AskButton className="btn sm ghost" label="Change target" name="Ask amax to change the utilisation target" prompt={`Change the utilisation target from ${r.target}% to `} pin={pin} />
        </div>
        <PinButton pin={pin} />
      </div>
      <TrendChart id="trend" label={`Utilisation per month against the ${r.target}% target`} labels={r.trend.map((t) => t.label)}
        series={[{ name: "Target", color: "var(--amber)", data: r.trend.map(() => r.target), dashed: true }, { name: `${now}, billable utilisation`, color: "var(--violet)", data: r.trend.map((t) => t.utilisation), area: true }, { name: `${then}, billable utilisation`, color: "var(--mint)", data: other.trend.map((t) => t.utilisation) }]} />
      <div className="legend" aria-hidden="true"><span><i style={{ background: "var(--violet)" }} />{now}</span><span><i style={{ background: "var(--mint)" }} />{then}</span><span><i className="target" />Target</span></div>
    </section>
  );
}
