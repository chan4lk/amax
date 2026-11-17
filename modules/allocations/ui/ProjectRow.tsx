import { PinButton } from "@amax/ui";
import type { GridLine, GridPerson } from "../server/grid";
import { monthLabel } from "../server/months";
import { pct, runsOf } from "./boardMath";
import { projectColor } from "./look";

type Props = { person: GridPerson; line: GridLine; months: { month: string; forecast: boolean }[]; order: number; framed: (month: number) => boolean };

export function ProjectRow({ person, line, months, order, framed }: Props) {
  const runs = runsOf(line);
  if (!runs.length) return null;
  const color = projectColor(line.projectKey, line.label);
  const count = months.length;
  const args = { person: person.employeeNo, ...(line.projectId ? { projectId: line.projectId } : { work: line.label }) };
  return (
    <div className="ad-prow pinnable">
      <PinButton pin={{ label: `${person.name}, ${line.label}`, tool: "get_allocation", args }} />
      <span className={framed(runs[0].from) ? "ad-plabel framed" : "ad-plabel"} style={{ left: pct(runs[0].from, count), color }}>{line.label}</span>
      {runs.map((range) => (
        <div key={range.from} className="ad-pbar a-grow" style={{ left: `calc(${pct(range.from, count)} + 4px)`, width: `calc(${pct(range.to - range.from + 1, count)} - 8px)`, background: color, ["--i" as string]: order }}>
          {months.slice(range.from, range.to + 1).map((m, k) => {
            const value = line.percents[range.from + k];
            return <span key={m.month} className={m.forecast ? "fc" : undefined} title={`${person.name} · ${line.label} · ${monthLabel(m.month)}: ${value}%`}>{value}%</span>;
          })}
        </div>
      ))}
    </div>
  );
}
