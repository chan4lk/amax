import type { Forecast } from "../server/forecast";
import type { GridPerson } from "../server/grid";
import { monthLabel } from "../server/months";
import { round1 } from "./look";
import type { Spot } from "./types";
import "./runway.css";

type Props = { f: Forecast; people: GridPerson[]; who: string; spot: Spot };

const spare = (gap: number) => `${gap >= 0 ? "+" : "−"}${Math.abs(gap)} FTE ${gap >= 0 ? "spare" : "short"}`;

export function RunwayBox({ f, people, who, spot }: Props) {
  const m = f.months[spot.index];
  const sum = (pick: (p: GridPerson) => number) => round1(people.reduce((n, p) => n + pick(p), 0) / 100);
  const yours = { capacity: sum((p) => p.capacity[spot.index]), planned: sum((p) => p.totals[spot.index]) };
  const over = people.filter((p) => p.capacity[spot.index] > 0 && p.totals[spot.index] > p.capacity[spot.index]).length;
  const team = round1(m.capacity - m.demand);
  const mine = round1(yours.capacity - yours.planned);
  const fill = m.capacity ? Math.min(100, (m.demand / m.capacity) * 100) : 0;
  return (
    <div className={`a-box ${spot.flip ? "left" : "right"}`} style={{ left: spot.left, top: spot.top }} role="status">
      <div className="a-box-head"><span>{monthLabel(m.month, "long")} {m.month.slice(0, 4)}</span><span className={m.forecast ? "a-tag" : "a-tag cur"}>{m.forecast ? "forecast" : "current quarter"}</span></div>
      <div className="a-totals">
        <div className="cap"><small>Capacity</small><b>{round1(m.capacity)}<em>FTE</em></b></div>
        <div className="dem"><small>Demand</small><b>{round1(m.demand)}<em>FTE</em></b></div>
      </div>
      <div className={team < 0 ? "a-fill short" : "a-fill"} aria-hidden="true"><i style={{ width: `${fill}%` }} /></div>
      <dl className="a-rows">
        <div><dt>Everyone <i>graph</i></dt><dd className={team >= 0 ? "ok" : "bad"}>{spare(team)}</dd></div>
        <div><dt>{who}</dt><dd className={mine >= 0 ? "ok" : "bad"}>{spare(mine)}<small>{yours.planned} of {yours.capacity} planned</small></dd></div>
      </dl>
      <p className="a-box-foot"><i className={over ? "bad" : "ok"} />{over ? `${over} ${over === 1 ? "person" : "people"} over 100% on the board` : "nobody over 100%"}</p>
    </div>
  );
}
