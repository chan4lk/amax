import type { ScreenProps } from "@amax/core";
import { PinButton } from "@amax/ui";
import { notFound, redirect } from "next/navigation";
import { teamGrid } from "../server/grid";
import { AskButton } from "./AskButton";
import { DayHead, dayName, Head, hrs, SignInFirst, STATUS, viewerOrNull, weekParam, weekSpan } from "./parts";

/** 073 AC-18: one member's week, read-only, opened from their name on Team time. Actions are chat's (D10). */
export async function SheetPage({ viewer: raw, params }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="time"><h1>Timesheet</h1><SignInFirst /></div>;
  const g = await teamGrid(viewer, weekParam(params.week), {});
  const row = g.grid.find((r) => r.weekId === params.weekId);
  if (!row || !row.weekId) {
    if (g.rows.length === 0 && params.weekId) redirect(`/time/my/${g.key}`);
    notFound();
  }
  const names = [...new Set(row.cells.flatMap((c) => c.projects.map((p) => p.name)))].sort();
  const pin = { label: `${row.personName}, ${g.key}`, tool: "get_timesheet", args: { weekId: row.weekId } };
  const [cls, label] = row.status === "not_started" ? ["bad", "Not started"] : STATUS[row.status];
  return (
    <div className="time">
      <Head title={row.personName} lede={`${weekSpan(g.week, g.days)}. ${row.total.toFixed(1)} h logged, ${row.utilisation}% of ${row.target} h.`} week={g.week} days={g.days} base="" />
      {row.rejectComment && row.status === "rejected" && <p className="chip bad" role="status">Sent back: {row.rejectComment}</p>}
      {row.anomalies.length > 0 && <p className="chip warn" role="status">Needs a closer look: {row.anomalies.join("; ")}</p>}
      <div className="card flush pinnable">
        <div className="card-head">
          <h2>{g.key} <span className={`chip ${cls}`}>{label}</span></h2><PinButton inline pin={pin} />
          <div className="actions"><AskButton className="btn" label="Ask amax about this week" prompt={`About ${row.personName}'s timesheet for ${g.key} (week id ${row.weekId}): `} pin={pin} /></div>
        </div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">{row.personName}'s hours for {g.key}</caption>
          <thead><tr><th>Project</th>{g.days.map((d) => <DayHead key={d} day={d} />)}<th className="num">Total</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {names.map((n) => {
              const per = row.cells.map((c) => c.projects.find((p) => p.name === n)?.hours ?? 0);
              return <tr key={n} className="pinnable"><td data-label="Project">{n}</td>{per.map((h, i) => <td className="num" data-label={dayName(g.days[i])} key={i}>{hrs(h)}</td>)}<td className="num" data-label="Total"><b>{per.reduce((a, b) => a + b, 0).toFixed(1)}</b></td>
                <td className="num" data-label=""><PinButton pin={{ label: `${row.personName}, ${n}, ${g.key}`, tool: "get_timesheet", args: { weekId: row.weekId, project: n } }} /></td></tr>;
            })}
            {names.length === 0 && <tr><td colSpan={g.days.length + 3} className="muted">No time logged this week.</td></tr>}
          </tbody>
          <tfoot><tr><th scope="row">Total</th>{row.cells.map((c) => <td className="num" data-label={dayName(c.day)} key={c.day}>{hrs(c.hours)}</td>)}<td className="num" data-label="Week"><b>{row.total.toFixed(1)}</b></td><td aria-hidden="true" /></tr></tfoot>
        </table></div>
      </div>
    </div>
  );
}
