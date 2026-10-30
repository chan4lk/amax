import { PinButton } from "@amax/ui";
import type { TeamGrid } from "../server/grid";
import { bandOf, type Band } from "./band";
import { BandIcon } from "./BandIcon";
import "./band.css";

// 075: Team time leads with two facts as bars: how far the team is with submitting, and how much the agents logged.
// Each status links to the grid filtered to it (a read-only control), and each part pins to the week it comes from.
export function StatusBand({ g, base }: { g: TeamGrid; base: string }) {
  const b = bandOf(g.rows, g.notStarted);
  if (!b.everyone) return null;
  const pin = (label: string) => ({ label: `${label}, ${g.key}`, tool: "get_team_week", args: { week: g.key } });
  const href = (status: string) => {
    const q = new URLSearchParams(Object.entries({ ...g.query, status }).filter((e): e is [string, string] => !!e[1]));
    return `${base}?${q}#timesheets`;
  };
  return (
    <div className="band" role="group" aria-label="This week's progress">
      <section className="card pinnable" aria-labelledby="band-sub">
        <PinButton pin={pin("Submissions")} />
        <h2 className="k" id="band-sub">Submissions</h2>
        <p className="fig">{b.sent} <span>of {b.everyone} submitted</span></p>
        <Bar label={submittedText(b)} parts={b.segments.map((s) => [s.key, s.count])} />
        <ul className="legend">
          {b.segments.map((s) => <li key={s.key}><a className={s.key} href={href(s.filter)}><BandIcon kind={s.key} />{s.count} {s.label}</a></li>)}
        </ul>
      </section>
      <section className="card pinnable" aria-labelledby="band-who">
        <PinButton pin={pin("Who logged it")} />
        <h2 className="k" id="band-who">Who logged it</h2>
        {b.hours ? (
          <>
            <p className="fig">{b.agentPct}% <span>by agents, of {b.hours.toFixed(1)} h</span></p>
            <Bar label={`Agents ${b.agent.toFixed(1)} h, ${b.agentPct}%; people ${b.people.toFixed(1)} h, ${b.peoplePct}%`} parts={[["agent", b.agent], ["people", b.people]]} />
            <ul className="legend">
              <li><span className="agent"><BandIcon kind="agent" />Agents {b.agent.toFixed(1)} h · {b.agentPct}%</span></li>
              <li><span className="people"><BandIcon kind="people" />People {b.people.toFixed(1)} h · {b.peoplePct}%</span></li>
            </ul>
          </>
        ) : <p className="fig empty">No hours logged yet</p>}
      </section>
    </div>
  );
}

const submittedText = (b: Band) => `${b.sent} of ${b.everyone} submitted: ${b.segments.map((s) => `${s.count} ${s.label}`).join(", ")}`;

function Bar({ label, parts }: { label: string; parts: [string, number][] }) {
  return (
    <div className="bar" role="img" aria-label={label}>
      {parts.filter(([, n]) => n > 0).map(([k, n]) => <i key={k} className={k} style={{ flexGrow: n }} />)}
    </div>
  );
}
