import { memo } from "react";
import { PinButton } from "@amax/ui";
import type { GridPerson } from "../server/grid";
import { monthLabel } from "../server/months";
import { benchRuns, pct, runsOf } from "./boardMath";
import { FixChip } from "./FixChip";
import { avatarClass } from "./look";
import { ProjectRow } from "./ProjectRow";

type Props = { person: GridPerson; months: { month: string; forecast: boolean }[]; order: number };

function LaneView({ person, months, order }: Props) {
  const count = months.length;
  const firstForecast = months.findIndex((m) => m.forecast);
  const rows = person.lines.filter((line) => runsOf(line).length);
  const pin = { label: `${person.name}, total`, tool: "get_allocation", args: { person: person.employeeNo } };
  const isOver = (i: number) => person.capacity[i] > 0 && person.totals[i] > person.capacity[i];
  return (
    <div className="ad-lane pinnable" style={{ ["--n" as string]: count, ["--fc" as string]: firstForecast < 0 ? count : firstForecast, ["--i" as string]: order }}>
      <PinButton pin={pin} />
      <div className="ad-lwho">
        <span className={`av ${avatarClass(person.name)}`} aria-hidden="true">{person.initials}</span>
        <div>{person.name}<small>{person.title}</small></div>
      </div>
      <div className="ad-ltrack">
        {rows.map((line) => <ProjectRow key={line.projectId ?? line.label} person={person} line={line} months={months} order={order} framed={isOver} />)}
        {rows.length === 0 && <div className="ad-prow" />}
        {benchRuns(person).map((run) => (
          <span key={run.from} className="ad-bblock" style={{ left: `calc(${pct(run.from, count)} + 4px)`, width: `calc(${pct(run.to - run.from + 1, count)} - 8px)` }} title={`${person.name}: nothing planned ${monthLabel(months[run.from].month)}${run.to > run.from ? `–${monthLabel(months[run.to].month)}` : ""}`}>
            <b>{run.to > run.from ? `Bench ${monthLabel(months[run.from].month)}–${monthLabel(months[run.to].month)}` : `Bench ${monthLabel(months[run.from].month)}`}</b>
            <small>nothing planned</small>
          </span>
        ))}
        {person.totals.map((total, i) => isOver(i) && (
          <span key={months[i].month} className="ad-oframe" style={{ left: `calc(${pct(i, count)} + 3px)`, width: `calc(${pct(1, count)} - 6px)` }}>
            <b>{total}%<span className="sr"> over capacity</span></b>
            <FixChip pin={pin} prompt={`Fix ${person.name}'s over-allocation in ${monthLabel(months[i].month, "long")}`} name={`Fix ${person.name}'s over-allocation in ${monthLabel(months[i].month, "long")} with amax`} />
          </span>
        ))}
        <div className="ad-trow">{person.totals.map((total, i) => <span key={months[i].month} className={isOver(i) ? "o" : undefined}>{total ? `${total}%` : "–"}</span>)}</div>
      </div>
    </div>
  );
}

export const Lane = memo(LaneView);
