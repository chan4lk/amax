import { PinButton } from "@amax/ui";
import type { GridRow, TeamGrid } from "../server/grid";
import { dayLabel } from "../week";
import { AskButton } from "./AskButton";
import { DayCell } from "./DayCell";
import { Filters } from "./Filters";
import { Since } from "./Since";
import { decidePrompt, remindAllPrompt } from "./prompts";
import { avatar, DayHead, dayName, initials, STATUS, Util } from "./parts";

// Quote every text cell, double embedded quotes, and defuse leading formula characters (CSV injection).
export const csvCell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

const STATE: Record<GridRow["status"], [string, string]> = { ...STATUS, not_started: ["bad", "Not started"] };
const csv = (rows: GridRow[], days: string[]) => encodeURIComponent([["Person", ...days.map(dayName), "Total", "Utilisation", "From agents", "Status"].join(","),
  ...rows.map((r) => [csvCell(r.personName), ...r.cells.map((c) => c.hours.toFixed(1)), r.total.toFixed(1), `${r.utilisation}%`, r.agentHours.toFixed(1), STATE[r.status][1]].join(","))].join("\n"));

const sheetPin = (row: GridRow, weekKey: string) => (row.weekId ? { label: `${row.personName}, ${weekKey}`, tool: "get_timesheet", args: { weekId: row.weekId } }
  : { label: `${row.personName}, ${weekKey} (not started)`, tool: "get_team_week", args: { week: weekKey } });

function Action({ row, weekKey }: { row: GridRow; weekKey: string }) {
  if (row.status === "approved") return <span className="muted">Locked</span>;
  if (row.status === "not_started") return <AskButton className="btn sm" spark={false} label="Remind" name={`Remind ${row.personName}`} prompt={`Remind ${row.personName} to log their hours for ${weekKey}`} pin={sheetPin(row, weekKey)} />;
  if (!row.canApprove || !row.weekId) return null;
  const verb = row.status === "submitted" ? "Approve" : "Remind";
  return <AskButton className="btn sm" spark={false} label={verb} name={`${verb} ${row.personName}`}
    prompt={decidePrompt(verb, { weekId: row.weekId, personName: row.personName }, weekKey)} pin={sheetPin(row, weekKey)} />;
}

// 073 AC-20: a header sorts by its column; again reverses it. Low first is one click on Total or Utilisation.
function SortHead({ g, base, by, label, num }: { g: TeamGrid; base: string; by: string; label: string; num?: boolean }) {
  const on = (g.query.sort ?? "name") === by;
  const dir = on && g.query.dir !== "desc" ? "desc" : "asc";
  const q = new URLSearchParams(Object.entries({ ...g.query, sort: by, dir }).filter(([, v]) => v) as [string, string][]);
  return <th className={num ? "num" : undefined} aria-sort={on ? (g.query.dir === "desc" ? "descending" : "ascending") : "none"}><a className="sort" href={`${base}?${q}`}>{label}{on ? (g.query.dir === "desc" ? " ↓" : " ↑") : ""}</a></th>;
}

export function Timesheets({ g, base }: { g: TeamGrid; base: string }) {
  const rows = g.grid;
  const late = rows.filter((r) => (r.status === "draft" || r.status === "rejected") && r.canApprove && r.weekId) as (GridRow & { weekId: string })[];
  const viewPin = { label: `Timesheets ${g.key}`, tool: "get_team_week", args: { week: g.key } };
  return (
    <div className="card flush pinnable" style={{ marginTop: 28 }}>
      <div className="card-head">
        <h2>Timesheets</h2><PinButton inline pin={viewPin} />
        <div className="actions">
          {late.length > 0 && <AskButton className="btn" spark={false} label={`Remind ${late.length} ${late.length === 1 ? "person" : "people"}`} prompt={remindAllPrompt(late, g.key)} pin={viewPin} />}
          <a className="btn" download={`timesheets-${g.key}.csv`} href={`data:text/csv;charset=utf-8,${csv(rows, g.days)}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg>Export</a>
        </div>
      </div>
      <Filters projects={g.options.projects} teams={g.options.teams} query={g.query} base={base} />
      <div className="scroll-x"><table className="tbl grid">
        <caption className="sr">Timesheets for {g.key}{g.query.project ? `, ${g.query.project} only` : ""}</caption>
        <thead><tr><SortHead g={g} base={base} by="name" label="Person" />{g.days.map((d) => <DayHead key={d} day={d} />)}<SortHead g={g} base={base} by="total" label="Total" num />
          <SortHead g={g} base={base} by="utilisation" label="Utilisation" /><th>From agents</th><th>Status</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekId ?? r.userId} className="pinnable">
              <td data-label="Person"><div className="who"><span className={`av sm ${avatar(r.personName)}`}>{initials(r.personName)}</span><div>
                {r.weekId ? <a href={`/time/w/${g.key}/p/${r.weekId}`}>{r.personName}</a> : r.personName}
                {(r.note || r.rejectComment) && <small>{r.rejectComment ? `Rejected: ${r.rejectComment}` : r.note}</small>}
                {r.lastReminder && <small className="reminded">Reminded <Since at={r.lastReminder.at} /> by {r.lastReminder.by}</small>}</div></div></td>
              {r.cells.map((c) => <td className="num day" data-label={dayName(c.day)} key={c.day}><DayCell who={r.personName} dayLabel={dayLabel(c.day)} hours={c.hours} state={c.state} projects={c.projects} /></td>)}
              <td className="num" data-label="Total"><b>{r.total.toFixed(1)}</b></td>
              <td data-label="Utilisation"><Util pct={r.utilisation} />{r.overtime && <small className="reminded">overtime</small>}</td>
              <td data-label="From agents"><span className="chip agent">{r.total ? Math.round((r.agentHours / r.total) * 100) : 0}%</span></td>
              <td data-label="Status"><span className={`chip ${STATE[r.status][0]}`}>{STATE[r.status][1]}</span></td>
              <td className="num" data-label=""><div className="row-actions"><Action row={r} weekKey={g.key} /><PinButton pin={sheetPin(r, g.key)} /></div></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={g.days.length + 6} className="muted">Nobody matches these filters.</td></tr>}
        </tbody>
        <tfoot><tr><th scope="row">Team</th>{g.footer.map((h, i) => <td className="num day" data-label={dayName(g.days[i])} key={g.days[i]}>{h ? h.toFixed(1) : "–"}</td>)}
          <td className="num" data-label="Week"><b>{g.summary.hours.toFixed(1)}</b></td><td data-label="Average">{g.summary.utilisation === null ? "–" : <Util pct={g.summary.utilisation} />}</td><td colSpan={3} aria-hidden="true" /></tr></tfoot>
      </table></div>
    </div>
  );
}
