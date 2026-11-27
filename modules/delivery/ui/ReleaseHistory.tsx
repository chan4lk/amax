import { PinButton, type PinRef } from "@amax/ui";
import { statusChangePin } from "../pins";
import type { DeploymentRow } from "../server/queries";
import { statusLabel } from "../server/release-status";
import { When } from "./When";

type Change = { id: string; from: string | null; to: string; at: string | null; source: string; deploymentId: string | null; by: string };

export function why(c: Change, history: DeploymentRow[]) {
  const env = history.find((d) => d.id === c.deploymentId)?.environment;
  if (c.source === "create") return "Created";
  if (c.source === "update") return "Edited";
  if (c.source === "schedule") return c.to === "overdue" ? "Target date passed" : c.to === "in_progress" ? "Start date reached" : "Date reached";
  if (c.source === "deployment") return env ? `Deployed to ${env}` : "Deployed";
  if (c.source === "environment") return env ? `${env} became its environment` : "Environment changed";
  return env ? `${env} deployment voided` : "Deployment voided";
}

const Chip = ({ s }: { s: string | null }) => (s ? <span className="chip">{statusLabel(s)}</span> : <span className="muted">—</span>);

export function ReleaseHistory({ changes, history, tracked, pin, release }: { changes: Change[]; history: DeploymentRow[]; tracked: boolean; pin: PinRef; release: { projectKey: string; version: string } }) {
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>Status history</h2><PinButton inline pin={pin} /></div>
      {changes.length === 0 ? <p className="muted rel-pad">{tracked ? "No status changes yet." : "This release isn't tracked, so it has no status history yet."}</p> : (
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Status history, oldest first</caption>
          <thead><tr><th>From</th><th>To</th><th>When</th><th>Why</th><th>Who</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
          <tbody>{changes.map((c) => (
            <tr key={c.id}><td data-label="From"><Chip s={c.from} /></td><td data-label="To"><Chip s={c.to} /></td>
              <td data-label="When">{c.at ? <When at={c.at} /> : "—"}</td><td data-label="Why">{why(c, history)}</td><td data-label="Who">{c.by}</td>
              <td className="num"><PinButton pin={statusChangePin({ ...release, id: c.id, to: c.to })} /></td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
