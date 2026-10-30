import { PinButton } from "@amax/ui";
import type { DayHours } from "../server/read";
import { dayName } from "./parts";

const AREA = 194;

export function WeekChart({ perDay, days, people, week }: { perDay: DayHours[]; days: string[]; people: number; week: string }) {
  const target = Math.max(people, 1) * 8;
  const peak = Math.max(...perDay.map((d) => d.agent + d.person));
  const top = peak > target * 1.05 ? Math.ceil(peak / 10) * 10 : target;
  const px = (h: number) => Math.round((h * AREA) / top);
  const label = perDay.map((d, i) => `${dayName(days[i])} ${(d.agent + d.person).toFixed(1)} h, ${d.agent.toFixed(1)} h from agents`).join("; ");
  return (
    <div className="card pinnable">
      <div className="card-head">
        <h2>Hours per day</h2><PinButton inline pin={{ label: `Hours per day, ${week}`, tool: "get_team_week", args: { week } }} />
        <div className="legend"><span><i style={{ background: "var(--violet)" }} />From commits and agents</span><span><i style={{ background: "var(--mint)" }} />Added by people</span></div>
      </div>
      <div className="week" role="img" aria-label={`Team hours per day: ${label}`} style={{ "--days": days.length } as React.CSSProperties}>
        <div className="yax">{[4, 3, 2, 1].map((q) => <span key={q}>{(top * q) / 4} h</span>)}<span>0</span></div>
        {perDay.map((d, i) => (
          <div className="day" key={days[i]}>
            {d.person > 0 && <span style={{ height: px(d.person), background: "var(--mint)" }} />}
            {d.agent > 0 && <span style={{ height: px(d.agent), background: "var(--violet)" }} />}
            <label>{dayName(days[i])}</label>
          </div>
        ))}
        <div className="target" style={{ bottom: 26 + px(target) }}><b>{target} h a day planned</b></div>
      </div>
    </div>
  );
}
