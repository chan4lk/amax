import { PinButton } from "@amax/ui";
import { environmentPin } from "../pins";
import type { EnvironmentRow } from "../server/queries";
import { AskButton } from "./AskButton";

// Keyed on the id, so a rename can't strand the pin (057). 081 amendment 5 (AC-60): a row has no buttons; its pin offers
// Make or Unmark Prod, Rename, and Remove (unused) or Move. Adding one stays the card's single Ask amax.
const envPin = (projectKey: string, e: EnvironmentRow) => environmentPin({ ...e, projectKey });

export function EnvironmentsCard({ projectKey, envs, canEdit }: { projectKey: string; envs: EnvironmentRow[]; canEdit: boolean }) {
  const pin = { label: `${projectKey} environments`, tool: "list_environments", args: { projectKey } };
  const prod = envs.find((e) => e.isProd);
  return (
    <div className="card flush pinnable" style={{ marginTop: 28 }}>
      <div className="card-head"><h2>Environments</h2><PinButton inline pin={pin} /><span className="muted" style={{ fontSize: 13 }}>{prod ? `Released means it reached ${prod.name}` : "No Prod: nothing counts as released"}</span>
        {canEdit && <div className="actions"><AskButton spark label="Ask amax to add an environment" prompt={`Add an environment to ${projectKey}: `} pin={pin} /></div>}</div>
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">Environments</caption>
        <thead><tr><th>Order</th><th>Name</th><th>Prod</th><th className="num">Deployments</th><th className="num"><span className="sr">Pin</span></th></tr></thead>
        <tbody>
          {envs.map((e) => (
            <tr key={e.name} className="pinnable">
              <td data-label="Order">{e.position}</td>
              <td data-label="Name"><b>{e.name}</b></td>
              <td data-label="Prod">{e.isProd ? <span className="chip good">Prod</span> : <span className="muted">–</span>}</td>
              <td data-label="Deployments" className="num">{e.deployments}</td>
              <td className="num"><PinButton pin={envPin(projectKey, e)} /></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
