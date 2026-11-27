import { can, type Viewer } from "@amax/auth";
import { EmptyState, IntentButton, PinButton } from "@amax/ui";
import { projectHref, releaseHref } from "../contracts";
import type { ReleaseRow } from "../server/queries";
import { filtered, filterReleases, listHref, type ReleaseFilter } from "../server/release-list";
import { categoryLabel, dayLabel, statusLabel } from "../server/release-status";
import { releasePin } from "../pins";
import { actionFor, standing } from "./ReleasesPage";
import { stageWord, unsuccessful } from "../server/deployment-status";
import { ReleaseFilters } from "./ReleaseFilters";

const TONE: Record<string, string> = { in_progress: "info", overdue: "bad", completed: "good" };

export const StatusChip = ({ r }: { r: Pick<ReleaseRow, "status" | "completion"> }) => (
  <><span className={`chip ${TONE[r.status ?? ""] ?? ""}`}>{statusLabel(r.status)}</span>{r.completion === "late" && <span className="chip warn">late</span>}</>
);

const MARK: Record<string, string> = { deployed: "●", testing: "◐" };
const STAGE = (status: string): [string, string] => [unsuccessful(status) ? "✕" : MARK[status] ?? "●", stageWord(status)];

export function Progress({ r }: { r: ReleaseRow }) {
  const { own, last } = standing(r);
  const said = own.map((s) => `${s.environment} ${s.status ? STAGE(s.status)[1] : "not yet"}`).join(", ");
  return (
    <span className="rel-track">
      <span aria-hidden="true">{own.map((s) => (s.status ? STAGE(s.status)[0] : "○")).join("")}</span>
      <span className="sr">{said}</span>
      <small className="muted" aria-hidden="true">{last ? `${last.environment}${last.status === "deployed" ? "" : ` ${STAGE(last.status!)[1]}`}` : "Not deployed"}</small>
    </span>
  );
}

const Row = ({ viewer, r, withProject }: { viewer: Viewer; r: ReleaseRow; withProject: boolean }) => {
  const act = actionFor(r, can(viewer, "delivery:deployment:record", { projectId: r.projectId }));
  return (
    <tr className="pinnable">
      <td data-label="Release"><a className="rowlink" href={releaseHref(r)}><b>{r.name ?? r.version}</b></a><br /><small className="muted">{r.version}</small></td>
      {withProject && <td data-label="Project"><span className="dot" style={{ background: `var(--${r.projectColor})` }} /><a className="quiet" href={projectHref(r.projectKey)}>{r.projectName}</a></td>}
      <td data-label="Category">{categoryLabel(r.category) ?? "—"}</td>
      <td data-label="Status"><StatusChip r={r} /></td>
      <td data-label="Start">{dayLabel(r.startDate) ?? "—"}</td>
      <td data-label="Target">{dayLabel(r.targetDate) ?? "—"}</td>
      <td data-label="Proposals" className="num">{r.proposals}</td>
      <td data-label="Progress"><Progress r={r} /></td>
      <td data-label="" className="num">
        {act.kind === "text" ? <span className="muted">{act.text}</span> : <span className="muted"><a className="rowlink" href={act.href} title={act.title}>{act.text}</a></span>}
        <PinButton pin={releasePin(r)} />
      </td>
    </tr>
  );
};

type Props = { viewer: Viewer; releases: ReleaseRow[]; root: string; query: Record<string, string | undefined>; filter: ReleaseFilter; projectKey?: string };

export function ReleaseTable({ viewer, releases, root, query, filter, projectKey }: Props) {
  const shown = filterReleases(releases, filter);
  const body = releases.length === 0 ? <EmptyState icon="rocket" title="No releases yet" hint="Ask amax to cut one when proposals are verified." />
    : shown.length === 0 ? <p className="dv-empty-line">No releases match these filters. <a href={listHref(root, { map: query.map })}>Clear filters</a></p>
    : (
      <div className="scroll-x"><table className="tbl">
        <caption className="sr">All releases{filtered(filter) ? ", filtered" : ""}</caption>
        <thead><tr><th>Release</th>{!projectKey && <th>Project</th>}<th>Category</th><th>Status</th><th>Start</th><th>Target</th><th className="num">Proposals</th><th>Progress</th><th className="num">Action</th></tr></thead>
        <tbody>{shown.map((r) => <Row key={r.id} viewer={viewer} r={r} withProject={!projectKey} />)}</tbody>
      </table></div>
    );
  return (
    <div className="card flush pinnable">
      <div className="card-head"><h2>All releases</h2><PinButton inline pin={{ label: "All releases", tool: "list_releases", args: projectKey ? { projectKey } : {} }} /><IntentButton intent="delivery.new-release" label="New release" /></div>
      {releases.length > 0 && <ReleaseFilters root={root} query={query} />}
      {body}
    </div>
  );
}
