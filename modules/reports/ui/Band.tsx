import { PinButton } from "@amax/ui";
import { pulsePin, reportPin } from "../pins";
import { hoursText } from "../server/lede";
import type { Pulse } from "../server/pulse-types";
import type { Report } from "../server/view";

type Part = { key: string; label: string; value: number };

function Bar({ label, parts }: { label: string; parts: Part[] }) {
  return <div className="bar" role="img" aria-label={label}>{parts.filter((p) => p.value > 0).map((p) => <i key={p.key} className={p.key} style={{ flexGrow: p.value }} />)}</div>;
}

const Legend = ({ parts }: { parts: Part[] }) => (
  <ul className="legend">{parts.map((p) => <li key={p.key}><span className={p.key}><i />{p.label}</span></li>)}</ul>
);

export function Band({ r, p }: { r: Report; p: Pulse }) {
  const t = r.team;
  const nonBillable = Math.max(0, t.loggedHours - t.billableHours), unlogged = Math.max(0, t.availableHours - t.loggedHours);
  const hours: Part[] = [
    { key: "billable", label: `Billable ${hoursText(t.billableHours)} h`, value: t.billableHours },
    { key: "nonbill", label: `Non-billable ${hoursText(Math.round(nonBillable * 10) / 10)} h`, value: nonBillable },
    { key: "unlogged", label: `Not logged ${hoursText(Math.round(unlogged * 10) / 10)} h`, value: unlogged },
  ];
  const planned = p.hours.rows.reduce((n, x) => n + x.planned, 0), logged = p.hours.rows.reduce((n, x) => n + x.logged, 0);
  const count = (f: "behind" | "over" | null) => p.hours.rows.filter((x) => x.flag === f).length;
  const plan: Part[] = [
    { key: "behind", label: `${count("behind")} behind plan`, value: count("behind") },
    { key: "onplan", label: `${count(null)} on plan`, value: count(null) },
    { key: "overplan", label: `${count("over")} over plan`, value: count("over") },
  ];
  return (
    <div className="band" role="group" aria-label={`${r.monthName} at a glance`}>
      <section className="card pinnable">
        <PinButton pin={reportPin(`Where the hours went, ${r.monthName}`, r.month)} />
        <h2 className="k">Where the hours went</h2>
        <p className="fig">{t.utilisation === null ? "–" : `${t.utilisation}%`} <span>billable, of {hoursText(t.availableHours)} h available · target {r.target}%</span></p>
        <Bar label={hours.map((h) => h.label).join(", ")} parts={hours} />
        <Legend parts={hours} />
      </section>
      <section className="card pinnable">
        <PinButton pin={pulsePin(`Plan vs actual, ${r.monthName}`, "hours")} />
        <h2 className="k">Plan vs actual</h2>
        {p.hours.state === "ok" ? (
          <>
            <p className="fig">{logged} h <span>logged of {planned} h planned on {p.hours.rows.length} {p.hours.rows.length === 1 ? "project" : "projects"}</span></p>
            <Bar label={plan.map((x) => x.label).join(", ")} parts={plan} />
            <Legend parts={plan} />
          </>
        ) : <p className="fig empty">{p.hours.state === "off" ? "Allocations or Time is not installed" : "No planned project hours yet"}</p>}
      </section>
    </div>
  );
}
