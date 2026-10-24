import { PinButton } from "@amax/ui";
import type { TeamRow } from "../server/team";
import { AskButton } from "./AskButton";
import { decidePrompt, remindAllPrompt } from "./prompts";
import { avatar, DAY_NAMES, hrs, initials, STATUS } from "./parts";

// Quote every text cell, double embedded quotes, and defuse leading formula characters (CSV injection).
export const csvCell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

const csv = (rows: TeamRow[]) => encodeURIComponent([["Person", ...DAY_NAMES, "Total", "From agents", "Status"].join(","),
  ...rows.map((r) => [csvCell(r.personName), ...r.days.map((d) => d.toFixed(1)), r.total.toFixed(1), r.agentHours.toFixed(1), r.status].join(","))].join("\n"));

const sheetPin = (row: TeamRow, weekKey: string) => ({ label: `${row.personName}, ${weekKey}`, tool: "get_timesheet", args: { weekId: row.weekId } });

function Action({ row, weekKey }: { row: TeamRow; weekKey: string }) {
  if (row.status === "approved") return <span className="muted">Locked</span>;
  if (!row.canApprove) return null;
  const verb = row.status === "submitted" ? "Approve" : "Remind";
  return <AskButton className={`btn sm${verb === "Approve" ? " ghost" : ""}`} spark={false} label={verb} name={`${verb} ${row.personName}`}
    prompt={decidePrompt(verb, row, weekKey)} pin={sheetPin(row, weekKey)} />;
}

export function Timesheets({ rows, weekKey }: { rows: TeamRow[]; weekKey: string }) {
  const late = rows.filter((r) => (r.status === "draft" || r.status === "rejected") && r.canApprove);
  return (
    <div className="card flush pinnable" style={{ marginTop: 28 }}>
      <div className="card-head">
        <h2>Timesheets</h2><PinButton inline pin={{ label: `Timesheets ${weekKey}`, tool: "get_team_week", args: { week: weekKey } }} />
        <div className="actions">
          {late.length > 0 && <AskButton className="btn" spark={false} label={`Remind ${late.length} ${late.length === 1 ? "person" : "people"}`} prompt={remindAllPrompt(late, weekKey)} pin={{ label: `Timesheets ${weekKey}`, tool: "get_team_week", args: { week: weekKey } }} />}
          <a className="btn" download={`timesheets-${weekKey}.csv`} href={`data:text/csv;charset=utf-8,${csv(rows)}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg>Export</a>
        </div>
      </div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Timesheets for {weekKey}</caption>
        <thead><tr><th>Person</th>{DAY_NAMES.map((d) => <th className="num" key={d}>{d}</th>)}<th className="num">Total</th><th>From agents</th><th>Status</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekId} className="pinnable">
              <td data-label="Person"><div className="who"><span className={`av sm ${avatar(r.personName)}`}>{initials(r.personName)}</span>{r.note || r.rejectComment ? <div>{r.personName}<small>{r.rejectComment ? `Rejected: ${r.rejectComment}` : r.note}</small></div> : r.personName}</div></td>
              {r.days.map((h, i) => <td className="num" data-label={DAY_NAMES[i]} key={i}>{hrs(h)}</td>)}
              <td className="num" data-label="Total"><b>{r.total.toFixed(1)}</b></td>
              <td data-label="From agents"><span className="chip agent">{r.total ? Math.round((r.agentHours / r.total) * 100) : 0}%</span></td>
              <td data-label="Status"><span className={`chip ${STATUS[r.status][0]}`}>{STATUS[r.status][1]}</span></td>
              <td className="num" data-label=""><div className="row-actions"><Action row={r} weekKey={weekKey} /><PinButton pin={sheetPin(r, weekKey)} /></div></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
