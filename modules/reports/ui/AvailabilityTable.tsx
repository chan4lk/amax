import { PinButton } from "@amax/ui";
import { personPin } from "../pins";
import { shortDay } from "../server/days";
import type { Report } from "../server/view";
import { hrs, Who } from "./parts";

const allocated = (n: number | null, on: boolean) => (n === null ? (on ? "—" : "Allocations not installed") : <span className={n > 100 ? "pill bad" : "pill"}>{n}%</span>);
const free = (n: number | null) => (n === null ? "—" : <span className={n > 0 ? "pill good" : "pill none"}>{hrs(n)}</span>);

export function AvailabilityTable({ r }: { r: Report }) {
  const a = r.availability;
  if (!a.range) return <p className="empty-line">{r.monthName} has no working days left.</p>;
  if (!a.rows.length) return <p className="empty-line">No one you can see has logged hours in {r.monthName} yet.</p>;
  return (
    <div className="scroll-x"><table className="tbl">
      <caption className="sr">Availability for the rest of {r.monthName}, {shortDay(a.range.from)} to {shortDay(a.range.to)}</caption>
      <thead><tr><th scope="col">Person</th><th scope="col" className="num">Working days left</th><th scope="col" className="num">Available</th><th scope="col" className="num">Allocated</th><th scope="col" className="num">Free</th></tr></thead>
      <tbody>
        {a.rows.map((x) => (
          <tr key={x.userId} className="pinnable" data-person={x.name}>
            <td data-label="Person"><Who name={x.name} initials={x.initials} /></td>
            <td className="num" data-label="Working days left">{x.workdays ?? "—"}{x.leaveLabel && <small>{x.leaveLabel}</small>}</td>
            <td className="num" data-label="Available">{x.availableHours === null ? "Leave not visible to you" : hrs(x.availableHours)}</td>
            <td className="num" data-label="Allocated">{allocated(x.allocated, a.allocationsOn)}</td>
            <td className="num" data-label="Free">{free(x.freeHours)}<PinButton pin={personPin(x, r.month, r.monthName)} /></td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
