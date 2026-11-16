import { can } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { facet, PinButton } from "@amax/ui";
import { projectHref, proposalHref } from "../contracts";
import { ProjectTabs } from "./ProjectSections";
import { deploymentPin, historyPin, proposalPin } from "../pins";
import { getProject, getRelease, listEnvironments } from "../server/queries";
import { AskButton } from "./AskButton";
import { day, needViewer, PhaseChip, SignInFirst } from "./parts";

export async function ReleasePage({ viewer: raw, params }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Release</h1><SignInFirst /></>;
  const [release, envs, project] = await Promise.all([getRelease(viewer, params.projectKey, params.version), listEnvironments(viewer, params.projectKey), getProject(viewer, params.projectKey)]);
  if (!release || !project) return <><h1>Release not found</h1></>;
  const canEdit = can(viewer, "delivery:release:create", { projectId: project.project.id });
  const canDeploy = can(viewer, "delivery:deployment:record", { projectId: project.project.id });
  const name = `${release.projectKey} ${release.version}`;
  // Pins key on ids, so a re-tag can't strand them (057, 059).
  const ref = historyPin(release);
  const deployPin = (d: { id: string; environment: string; at: string }) => deploymentPin({ ...release, ...d });
  const pin = (label: string) => <PinButton inline pin={facet(ref, ` ${label}`)} />;
  const included = release.proposals.filter((p) => p.included);
  return (
    <>
      {/* 081 amendment 5 (AC-54): the trail follows the project. */}
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery">Projects</a><span>/</span><a href={projectHref(release.projectKey)}>{release.projectName}</a><span>/</span><a href={projectHref(release.projectKey, "releases")}>Releases</a><span>/</span>{release.version}</nav>
      <div className="row head"><div><h1>{release.projectName} {release.version}</h1><p className="lede">{included.length} proposals. Released means it reached {envs.find((e) => e.isProd)?.name ?? "a Prod environment (this project has none)"}. Changes happen in chat.</p></div></div>
      {/* AC-55: the project's tabs stay, Releases current. */}
      <ProjectTabs projectKey={release.projectKey} current="releases" />
      <div className="cols even" style={{ marginBottom: 28 }}>
        <div className="card pinnable">
          <div className="card-head"><h2>Tag and proposals</h2>{pin("proposals")}</div>
          {/* 081 amendment 10 (AC-92 to AC-94): the tag first, then aligned rows with no scroll bar of their own. */}
          <p className="rel-tag"><span className="k">Tag</span><span className="chip">{release.version}</span><span className="muted">{included.length} {included.length === 1 ? "proposal" : "proposals"}</span></p>
          <ul className="rel-props" aria-label="Proposals in this release">
            {included.map((p) => <li key={p.key} className="pinnable"><a href={proposalHref(p.key)}><b>{p.key}</b><span>{p.title}</span></a><PhaseChip phase={p.phase} /><PinButton pin={proposalPin(p)} /></li>)}
            {included.length === 0 && <li className="muted">No proposals yet.</li>}
          </ul>
          {canEdit && <div className="actions">
            <AskButton spark label="Ask amax to re-tag" prompt={`Tag ${name} as `} pin={ref} />
            <AskButton spark label="Ask amax to change the proposals" prompt={`Set the proposals in ${name} to: ${included.map((p) => p.key).join(", ")}`} pin={ref} />
          </div>}
        </div>
        <div className="card pinnable">
          <div className="card-head"><h2>Record a deployment</h2>{pin("deployments")}</div>
          <p className="muted">Environments, in order: {envs.map((e) => `${e.name}${e.isProd ? " (Prod)" : ""}`).join(", ") || "none yet"}. Pipelines record deployments; record or void one by asking in chat.</p>
          {canDeploy && <AskButton spark className="btn sm primary" label="Ask amax to record a deployment" prompt={`Record a deployment of ${name} to `} pin={ref} />}
        </div>
      </div>
      <div className="card flush pinnable">
        <div className="card-head"><h2>Deployment history</h2>{pin("deployment history")}</div>
        <div className="scroll-x"><table className="tbl">
          <caption className="sr">Deployment history</caption>
          <thead><tr><th>When</th><th>Environment</th><th>Status</th><th>Recorded by</th><th>Note</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {release.history.length === 0 && <tr><td colSpan={6} className="muted">Not deployed yet.</td></tr>}
            {release.history.map((d) => (
              <tr key={d.id} className="pinnable">
                <td data-label="When">{day(d.at)}</td><td data-label="Environment">{d.environment}</td>
                <td data-label="Status">{d.voidedAt ? <span className="chip">Voided: {d.voidReason}</span> : <span className={`chip ${d.status === "rolled-back" ? "bad" : d.status === "testing" ? "info" : "good"}`}>{d.status}</span>}</td>
                <td data-label="Recorded by">{d.recordedBy}</td><td data-label="Note">{d.note ?? (d.run ? `Run ${d.run}` : "–")}</td>
                <td className="num">{canDeploy && !d.voidedAt && <AskButton label="Void" name={`Void the ${d.environment} deployment of ${day(d.at)}`} pin={deployPin(d)}
                  prompt={`Void the ${d.environment} deployment of ${name} (id ${d.id}). Reason: `} />}<PinButton pin={deployPin(d)} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
