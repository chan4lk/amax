import { PinButton } from "@amax/ui";
import type { MyWeek } from "../server/my";
import { myBandOf } from "./band";
import { BandIcon } from "./BandIcon";
import "./band.css";

// 075 amendment 2: My timesheet's week at a glance, Team time's band made minimal: one slim strip with the hours
// against the person's target and who logged them. Pinned, it reads the week through get_my_week.
export function MyBand({ m }: { m: MyWeek }) {
  const b = myBandOf(m);
  const pin = { label: `My week, ${m.key}`, tool: "get_my_week", args: { week: m.key } };
  return (
    <section className="card pinnable mband" aria-label="My week at a glance">
      <PinButton pin={pin} />
      <div className="mb-part">
        <p className="mb-fig">{b.hours ? <>{b.hours.toFixed(1)} h <span>of {b.target} h · {b.pct}%</span></> : <span>No hours logged yet · target {b.target} h</span>}</p>
        <div className="bar" role="img" aria-label={`${b.hours.toFixed(1)} of ${b.target} hours, ${b.pct}%`}>{b.hours > 0 && <i className={b.pct > 100 ? "rejected" : "submitted"} style={{ width: `${Math.min(100, b.pct)}%` }} />}</div>
      </div>
      {b.hours > 0 && (
        <div className="mb-part">
          <p className="mb-fig">{b.agentPct}% <span>by agents</span></p>
          <div className="bar" role="img" aria-label={`Agents ${b.agent.toFixed(1)} h, ${b.agentPct}%; you ${b.mine.toFixed(1)} h, ${b.minePct}%`}>
            {b.agent > 0 && <i className="agent" style={{ flexGrow: b.agent }} />}{b.mine > 0 && <i className="people" style={{ flexGrow: b.mine }} />}
          </div>
          <p className="mb-legend"><span className="agent"><BandIcon kind="agent" />Agents {b.agent.toFixed(1)} h</span><span className="people"><BandIcon kind="people" />You {b.mine.toFixed(1)} h</span></p>
        </div>
      )}
      {m.status === "approved" && <p className="mb-lock approved"><BandIcon kind="approved" />Approved · locked</p>}
    </section>
  );
}
