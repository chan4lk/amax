import { PinButton } from "@amax/ui";
import { personPin, reportPin } from "../pins";
import type { Report } from "../server/view";
import { hrs, logged, Meter, Who } from "./parts";

// 072: a row whose hours include a week of unknown status says so, rather than showing a figure that may be wrong.
const leaveNote = (r: Report["rows"][number]) => [r.leaveHidden ? "Leave not visible to you" : r.leaveLabel, r.hoursIncomplete ? "Some hours' timesheet status unknown" : null].filter(Boolean).join(" · ") || null;

export function UtilisationTable({ r }: { r: Report }) {
  if (!r.rows.length) return <p className="empty-line">No logged hours you can see for {r.monthName} yet.</p>;
  return (
    <div className="scroll-x"><table className="tbl">
      <caption className="sr">Utilisation per person, {r.monthName} {r.span}</caption>
      <thead><tr><th scope="col">Person</th><th scope="col" className="num">Available</th><th scope="col" className="num">Logged</th><th scope="col" className="num">Billable</th><th scope="col" style={{ minWidth: 280 }}>Utilisation</th></tr></thead>
      <tbody>
        {r.rows.map((x) => (
          <tr key={x.userId} className="pinnable" data-person={x.name}>
            <td data-label="Person"><Who name={x.name} initials={x.initials} /></td>
            <td className="num" data-label="Available">{hrs(x.availableHours)}{leaveNote(x) && <small>{leaveNote(x)}</small>}</td>
            <td className="num" data-label="Logged">{logged(x.loggedHours)}</td>
            <td className="num" data-label="Billable">{logged(x.billableHours)}</td>
            <td data-label="Utilisation"><Meter value={x.utilisation} tone={(x.utilisation ?? 0) >= r.target ? "good" : "under"} /><PinButton pin={personPin(x, r.month, r.monthName)} /></td>
          </tr>
        ))}
        <tr className="total pinnable">
          <td data-label="Team">Team</td>
          <td className="num" data-label="Available">{hrs(r.team.availableHours)}</td>
          <td className="num" data-label="Logged">{logged(r.team.loggedHours)}</td>
          <td className="num" data-label="Billable">{logged(r.team.billableHours)}</td>
          <td data-label="Utilisation"><Meter value={r.team.utilisation} tone="team" /><PinButton pin={reportPin(`Team utilisation, ${r.monthName}`, r.month)} /></td>
        </tr>
      </tbody>
    </table></div>
  );
}
