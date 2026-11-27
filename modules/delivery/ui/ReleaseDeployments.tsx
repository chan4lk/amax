import { PinButton, type PinRef } from "@amax/ui";
import type { DeploymentRow, EnvironmentRow } from "../server/queries";
import { AskButton } from "./AskButton";
import { stageWord, unsuccessful } from "../server/deployment-status";
import { When } from "./When";

type Props = {
  envs: EnvironmentRow[]; history: DeploymentRow[]; completingId: string | null; name: string; canDeploy: boolean;
  head: React.ReactNode; deployPin: (d: DeploymentRow) => PinRef;
};

const Status = ({ d }: { d: DeploymentRow }) => d.voidedAt ? <span className="chip">Voided: {d.voidReason}</span>
  : <span className={`chip ${unsuccessful(d.status) ? "bad" : d.status === "testing" ? "info" : "good"}`}>{stageWord(d.status)}</span>;

function Row({ d, completing, name, canDeploy, pin }: { d: DeploymentRow; completing: boolean; name: string; canDeploy: boolean; pin: PinRef }) {
  return (
    <li className="pinnable rel-dep">
      <Status d={d} />
      <When at={d.at} />
      <span className="muted">{d.recordedBy}</span>
      {d.run && <span className="muted">Run {d.run}</span>}
      {d.note && <span>{d.note}</span>}
      {completing && <span className="chip good">Completed the release</span>}
      <span className="rel-dep-act">
        {canDeploy && !d.voidedAt && <AskButton label="Void" name={`Void the ${d.environment} deployment`} pin={pin} prompt={`Void the ${d.environment} deployment of ${name} (id ${d.id}). Reason: `} />}
        <PinButton pin={pin} />
      </span>
    </li>
  );
}

export function ReleaseDeployments({ envs, history, completingId, name, canDeploy, head, deployPin }: Props) {
  return (
    <div className="card pinnable">
      {head}
      {envs.map((e) => {
        const rows = history.filter((d) => d.environment === e.name);
        return (
          <section key={e.id} className="rel-env" aria-label={`${e.name} deployments`}>
            <h3>{e.name}{e.isProd && <span className="chip">Prod</span>}</h3>
            {rows.length === 0 ? <p className="muted">Not deployed yet</p>
              : <ul>{rows.map((d) => <Row key={d.id} d={d} completing={d.id === completingId} name={name} canDeploy={canDeploy} pin={deployPin(d)} />)}</ul>}
          </section>
        );
      })}
      {envs.length === 0 && <p className="muted">This project has no environments yet.</p>}
    </div>
  );
}
