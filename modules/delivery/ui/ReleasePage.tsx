import { can, type Viewer } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { facet, PinButton } from "@amax/ui";
import { projectHref, proposalHref, releaseHref } from "../contracts";
import { ProjectTabs } from "./ProjectHeader";
import { deploymentPin, historyPin, proposalPin } from "../pins";
import { getProject, getRelease, listEnvironments } from "../server/queries";
import { categoryLabel, dayLabel } from "../server/release-status";
import { AskButton } from "./AskButton";
import { LoadSafe } from "./LoadSafe";
import { completedLine, ReleaseInfo } from "./ReleaseInfo";
import { ReleaseDeployments } from "./ReleaseDeployments";
import { ReleaseHistory } from "./ReleaseHistory";
import { needViewer, PhaseChip, SignInFirst } from "./parts";

type Release = NonNullable<Awaited<ReturnType<typeof getRelease>>> & { projectId: string };
type Envs = Awaited<ReturnType<typeof listEnvironments>>;
function Actions({ release, canEdit }: { release: Release; canEdit: boolean }) {
  const ref = historyPin(release);
  if (!canEdit) return <p className="muted rel-note">Only the project&apos;s PM or an Admin can change a release.</p>;
  if (release.status === "completed") return null;
  const edit = `Edit release ${release.version} of ${release.projectKey}`;
  return <div className="actions"><AskButton spark className="btn sm primary" label={release.category ? "Edit release" : "Ask amax to track it"} prompt={edit} pin={ref} /></div>;
}

export function ReleaseBody({ viewer, release, envs }: { viewer: Viewer; release: Release; envs: Envs }) {
  const projectId = { projectId: release.projectId };
  const canEdit = can(viewer, "delivery:release:create", projectId), canDeploy = can(viewer, "delivery:deployment:record", projectId);
  const open = release.status !== "completed";
  const ref = historyPin(release);
  const name = `${release.projectKey} ${release.version}`;
  const pin = (label: string) => facet(ref, ` ${label}`);
  const included = release.proposals.filter((p) => p.included);
  const done = completedLine(release);
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery">Projects</a><span>/</span><a href={projectHref(release.projectKey)}>{release.projectName}</a><span>/</span><a href={projectHref(release.projectKey, "releases")}>Releases</a><span>/</span>{release.version}</nav>
      <div className="row head"><div><h1>{release.name ?? release.version}</h1>
        <p className="lede">{release.projectName} {release.version}{release.category ? ` · ${categoryLabel(release.category)} release` : ""}. {done ? `${done}. A completed release can't change.` : "Changes happen in chat."}</p></div>
        <Actions release={release} canEdit={canEdit} /></div>
      <ProjectTabs projectKey={release.projectKey} current="releases" />
      {release.completingVoided && <p className="rel-voided" role="note">The deployment that completed this release was voided on {dayLabel(release.completingVoided.day)}: {release.completingVoided.reason}. The release stays completed.</p>}
      <div className="cols even" style={{ marginBottom: 28 }}>
        <ReleaseInfo r={release} version={release.version} projectName={release.projectName} pin={pin("information")} />
        <div className="card pinnable">
          <div className="card-head"><h2>Proposals</h2><PinButton inline pin={pin("proposals")} /></div>
          <ul className="rel-props" aria-label="Proposals in this release">
            {included.map((p) => <li key={p.key} className="pinnable"><a href={proposalHref(p.key)}><b>{p.key}</b><span>{p.title}</span></a><PhaseChip phase={p.phase} /><PinButton pin={proposalPin(p)} /></li>)}
            {included.length === 0 && <li className="muted">No proposals yet.</li>}
          </ul>
          {canEdit && open && <div className="actions">
            <AskButton spark label="Ask amax to re-tag" prompt={`Tag ${name} as `} pin={ref} />
            <AskButton spark label="Ask amax to change the proposals" prompt={`Set the proposals in ${name} to: ${included.map((p) => p.key).join(", ")}`} pin={ref} />
          </div>}
        </div>
      </div>
      <div className="cols even">
        <ReleaseDeployments envs={envs} history={release.history} completingId={release.completingDeploymentId} name={name} canDeploy={canDeploy}
          deployPin={(d) => deploymentPin({ ...release, ...d })}
          head={<div className="card-head"><h2>Deployments</h2><PinButton inline pin={pin("deployments")} />
            {canDeploy && <AskButton spark className="btn sm primary" label="Record a deployment" prompt={`Record a deployment of ${name} to `} pin={ref} />}</div>} />
        <ReleaseHistory changes={release.statusHistory} history={release.history} tracked={Boolean(release.category)} pin={pin("status history")} release={release} />
      </div>
    </>
  );
}

export async function ReleasePage({ viewer: raw, params }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Release</h1><SignInFirst /></>;
  const here = releaseHref({ projectKey: params.projectKey, version: params.version });
  const load = () => Promise.all([getRelease(viewer, params.projectKey, params.version), listEnvironments(viewer, params.projectKey), getProject(viewer, params.projectKey)]);
  return (
    <>
      <LoadSafe what="this release" retry={here} load={load}>
        {([release, envs, project]) => (release && project ? <ReleaseBody viewer={viewer} release={{ ...release, projectId: project.project.id }} envs={envs} /> : <h1>Release not found</h1>)}
      </LoadSafe>
    </>
  );
}
