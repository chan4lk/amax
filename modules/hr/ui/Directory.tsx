import { PinButton } from "@amax/ui";
import { personPin } from "../pins";
import type { DirectoryRow } from "../server/queries";
import { avClass, countryName, statusChip, todayLabel } from "./parts";

export function Directory({ rows, total, allHref }: { rows: DirectoryRow[]; total: number; allHref?: string }) {
  return (
    <div className="card flush">
      <div className="card-head">
        <h2>Directory</h2>
        <div className="actions"><span className="muted" style={{ fontSize: 13 }}>Showing {rows.length} of {total}</span>{allHref && rows.length < total && <a className="btn" href={allHref}>Show all</a>}</div>
      </div>
      <div className="scroll-x">
        <table className="tbl">
          <caption className="sr">Directory</caption>
          <thead><tr><th>Person</th><th>Role</th><th>Department</th><th>Entity</th><th>Manager</th><th>Status</th><th>Today</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {rows.map((p) => {
              const [tone, label] = statusChip(p, p.asOf);
              const now = todayLabel(p);
              return (
                <tr key={p.id} className="pinnable">
                  <td data-label="Person"><a className="rowlink who" href={`/hr/p/${p.employeeNo}`}><span className={`av sm ${avClass(p.name)}`} aria-hidden="true">{p.initials}</span>{p.name}</a></td>
                  <td data-label="Role">{p.title}</td>
                  <td data-label="Department">{p.department ?? "–"}</td>
                  <td data-label="Entity" className="nowrap">{countryName(p.country, p.entityName)}</td>
                  <td data-label="Manager">{p.managerName ?? "–"}</td>
                  <td data-label="Status"><span className={`chip ${tone}`}>{label}</span></td>
                  <td data-label="Today" className={now === "Working" ? "muted" : undefined}>{now}</td>
                  <td data-label="" className="num"><PinButton pin={personPin(p)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
