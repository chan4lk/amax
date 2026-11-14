import { can, type Viewer } from "@amax/auth";
import type { ScreenProps } from "@amax/core";
import { IntentButton, PinButton } from "@amax/ui";
import { projectHref, releaseHref } from "../contracts";
import { AskButton } from "./AskButton";
import { listReleases, stageColumns, today, type ReleaseRow } from "../server/queries";
import { releasePin } from "../pins";
import { day, needViewer, SignInFirst } from "./parts";

const HEX: Record<string, string> = { violet: "#7B61FF", amber: "#F2A93B", pink: "#F48B9B", mint: "#2FCB8C" };

/**
 * Where a release stands, worked out once for the table's action, the map's line and its pill
 * (review round 1): its stages in the project's own order, the last one reached, and the deployed
 * Prod record that makes it Live (only that says Live, wherever the last reached stage sits).
 */
export function standing(r: ReleaseRow) {
  const own = [...r.stages].sort((a, b) => a.position - b.position);
  const lastI = own.reduce((at, s, i) => (s.status ? i : at), -1);
  return { own, lastI, last: lastI >= 0 ? own[lastI] : null, live: own.find((s) => s.isProd && s.status === "deployed") ?? null };
}

/**
 * What the next action is. Null means Live. Stages are taken in order (gaps in positions after a
 * removal don't end the chain); Prod still testing is finished in place; a project with no Prod
 * stage says so (final review).
 */
export function nextStep(r: ReleaseRow): { label: string; environment: string | null; primary: boolean } | null {
  const { own, lastI, last, live } = standing(r);
  if (live) return null;
  if (last?.status === "rolled-back") return { label: `Retry ${last.environment}`, environment: last.environment, primary: false };
  // A stage still testing can be promoted past (as in the mock), except Prod: that one is finished in place.
  if (last?.status === "testing" && last.isProd) return { label: `Finish ${last.environment}`, environment: last.environment, primary: true };
  const next = own[lastI + 1];
  if (next) return { label: `${last ? "Promote" : "Deploy"} to ${next.environment}`, environment: next.environment, primary: true };
  // Nothing after the last reached stage (it may sit after Prod): Prod is still the way to Live.
  const prod = own.find((s) => s.isProd);
  if (prod) {
    const verb = prod.status === "testing" ? "Finish" : prod.status === "rolled-back" ? "Retry" : "Deploy to";
    return { label: `${verb} ${prod.environment}`, environment: prod.environment, primary: prod.status !== "rolled-back" };
  }
  return { label: "No Prod stage", environment: null, primary: false };
}

export { releaseHref };

export type Action =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string; title: string };

/** "Promote to UAT" or "Deploy to Dev" reads "Next: UAT"; "Retry UAT" and "Finish Prod" read as they are. */
const stepText = (label: string) => label.replace(/^(Promote|Deploy) to /, "Next: ");

/**
 * The table's action cell. A release nothing has reached yet reads "Building" as in the mock; for a
 * viewer who may record deployments it links to the release page, where the first deployment is
 * recorded (review round 1: the row must not lose that path).
 */
export function actionFor(r: ReleaseRow, allowed: boolean): Action {
  const step = nextStep(r);
  if (!step) return { kind: "text", text: "Live" };
  if (!standing(r).last) return allowed ? { kind: "link", text: "Building", href: releaseHref(r), title: "Record the first deployment" } : { kind: "text", text: "Building" };
  // 081 amendment 5 (AC-61): the row says what's next; the deployment itself comes from the row's pin, in chat.
  return { kind: "text", text: stepText(step.label) };
}

/**
 * The map's Active range, per project. Its current Live release is the one with the latest Prod
 * deployment. A release is in flight when it isn't Live and its latest deployment is after that
 * Prod deployment and within 45 days: an abandoned or rolled-back release older than the current
 * Live one, or stale, is history (review rounds 3 and 4). The map shows the releases in flight, or,
 * when there are none, the current Live release if its Prod deployment is within 45 days.
 */
export function onActiveMap(releases: ReleaseRow[], now: Date): ReleaseRow[] {
  const recent = (at: number) => now.getTime() - at <= 45 * 86_400_000;
  const latestAt = (r: ReleaseRow) => Math.max(...r.stages.map((s) => (s.status && s.at ? Date.parse(s.at) : -Infinity)));
  const show = new Set<ReleaseRow>();
  for (const projectId of new Set(releases.map((r) => r.projectId))) {
    const own = releases.map((r) => ({ r, s: standing(r) })).filter((x) => x.r.projectId === projectId && x.s.last);
    const current = own.filter((x) => x.s.live?.at).sort((a, b) => Date.parse(b.s.live!.at!) - Date.parse(a.s.live!.at!))[0];
    const liveAt = current ? Date.parse(current.s.live!.at!) : -Infinity;
    const moving = own.filter((x) => !x.s.live && latestAt(x.r) > liveAt && recent(latestAt(x.r)));
    if (moving.length) moving.forEach((x) => show.add(x.r));
    else if (current && recent(liveAt)) show.add(current.r);
  }
  return releases.filter((r) => show.has(r));
}

function cell(s: ReleaseRow["stages"][number]) {
  if (!s.status) return <span className="muted">–</span>;
  if (s.status === "rolled-back") return <><span className="chip bad">Rolled back {day(s.at)}</span>{(s.run || s.note) && <small>{[s.run && `Run ${s.run}`, s.note].filter(Boolean).join(", ")}</small>}</>;
  if (s.status === "testing") return <span className="chip info">{day(s.at)}, testing</span>;
  return s.isProd ? <span className="chip good">{day(s.at)}</span> : <>{day(s.at)}</>;
}

/**
 * One row of the release map, always in the project's own stage order. When that order agrees with
 * the shared columns each station sits under its column; when it doesn't (projects contradict each
 * other) the row is laid out by its own order and labels its stations (review rounds 1 to 3).
 */
export function mapRow(r: ReleaseRow, columns: string[]) {
  const { own, lastI: lastReached } = standing(r);
  const cols = own.map((s) => columns.indexOf(s.environment));
  const agrees = cols.every((c, i) => c >= 0 && (i === 0 || c > cols[i - 1]));
  const slot = (i: number) => (agrees ? cols[i] : i);
  return {
    agrees,
    stations: own.map((s, i) => ({ environment: s.environment, slot: slot(i), reached: Boolean(s.status), last: i === lastReached })),
    lineTo: lastReached >= 0 ? slot(lastReached) : null,
    aheadTo: own.length ? slot(own.length - 1) : null,
    back: lastReached >= 0 && own[lastReached].status === "rolled-back",
  };
}

const dayName = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");

/** The pill beside a row's last station, worded as in the mock ("Testing since Oct 15", "Rolled back Wed Oct 14", "Live since Oct 1"). */
export function mapPill(r: ReleaseRow) {
  const { last, live } = standing(r);
  if (!last) return null;
  if (live) return { kind: "live" as const, text: `Live since ${day(live.at)}` };
  if (last.status === "rolled-back") return { kind: "back" as const, text: `Rolled back ${last.at ? dayName(last.at) : ""}`.trim() };
  if (last.status === "testing") return { kind: "testing" as const, text: `Testing since ${day(last.at)}` };
  return { kind: "in" as const, text: `In ${last.environment} since ${day(last.at)}` };
}

// Fills, inks and widths as drawn in the mock.
const PILL = { back: { fill: "#FDE7E4", ink: "#C2412F", w: 128 }, live: { fill: "#E3F8EF", ink: "#14845A", w: 118 }, testing: { fill: "#ECE8FF", ink: "#5B44D6", w: 132 }, in: { fill: "#ECE8FF", ink: "#5B44D6", w: 150 } };

// The mock's release map: one line per active release, stations per environment, and a status pill.
function ReleaseMap({ releases, columns }: { releases: ReleaseRow[]; columns: string[] }) {
  const active = releases.filter((r) => standing(r).last);
  const x = (i: number) => 300 + i * 180;
  const h = 70 * active.length + 60;
  return (
    <svg viewBox={`0 0 ${Math.max(900, x(columns.length - 1) + 60)} ${h}`} role="img" aria-label={active.map((r) => `${r.projectName} ${r.version}: ${mapPill(r)?.text ?? "not deployed"}`).join(". ")}>
      <g className="env" textAnchor="middle">{columns.map((e, i) => <text key={e} x={x(i)} y={20}>{e}</text>)}</g>
      <g stroke="var(--line)" strokeWidth={1.5}>{columns.map((e, i) => <line key={e} x1={x(i)} y1={34} x2={x(i)} y2={h - 8} />)}</g>
      {active.map((r, row) => {
        const y = 86 + row * 70;
        const c = HEX[r.projectColor] ?? "#7B61FF";
        const m = mapRow(r, columns);
        const lastI = m.lineTo!;
        const pill = mapPill(r)!;
        const live = pill.kind === "live";
        const w = PILL[pill.kind].w;
        const px = live ? x(lastI) - 144 : x(lastI) + 26;
        const py = live ? y - 30 : y - 14;
        return (
          <g key={r.id}>
            <text className="lbl" x={0} y={y + 5}>{r.projectName}</text>
            <text className="cap" x={0} y={y + 24}>{r.version}, {r.proposals} proposals{m.agrees ? "" : ", own stage order"}</text>
            <path className={row % 3 ? `line l${(row % 3) + 1}` : "line"} pathLength={1} d={`M240 ${y}H${x(lastI) - (m.back ? 12 : 0)}`} stroke={c} />
            {m.aheadTo !== null && lastI < m.aheadTo && <path className="ahead" d={`M${x(lastI) + (m.back ? 12 : 0)} ${y}H${x(m.aheadTo)}`} stroke={c} />}
            {m.stations.map((s) => (
              <g key={s.environment}>
                {s.last && m.back ? <><circle cx={x(s.slot)} cy={y} r={13} fill="#F26B5B" /><path d={`m${x(s.slot) - 5} ${y - 5} 10 10m0-10-10 10`} stroke="#fff" strokeWidth={2.6} strokeLinecap="round" /></>
                  : s.last && live ? <><circle cx={x(s.slot)} cy={y} r={13} fill={c} /><circle cx={x(s.slot)} cy={y} r={5} fill="#fff" /></>
                  : s.last ? <><circle className="station" cx={x(s.slot)} cy={y} r={11} stroke={c} /><circle cx={x(s.slot)} cy={y} r={4.5} fill={c} /></>
                  : <circle className="station" cx={x(s.slot)} cy={y} r={s.reached ? 9 : 8} stroke={s.reached ? c : "var(--line-2)"} />}
                {!m.agrees && <text className="cap" textAnchor="middle" x={x(s.slot)} y={y + 28}>{s.environment}</text>}
              </g>
            ))}
            <rect x={px} y={py} width={w} height={live ? 24 : 28} rx={live ? 9 : 10} fill={PILL[pill.kind].fill} />
            <text x={px + w / 2} y={py + (live ? 17 : 19)} textAnchor="middle" fill={PILL[pill.kind].ink} fontSize={live ? 12 : 12.5} fontWeight={600} fontFamily="Avenir Next,system-ui">{pill.text}</text>
          </g>
        );
      })}
    </svg>
  );
}

export async function ReleasesPage({ viewer: raw, searchParams = {} }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Releases</h1><SignInFirst /></>;
  const [releases, now] = await Promise.all([listReleases(viewer), today(viewer)]);
  return (
    <>
      <h1>Releases</h1>
      <p className="lede">A release moves when a pipeline reports a deployment, when an agent records one, or when you promote it here.</p>
      <ReleasesCards viewer={viewer} releases={releases} now={now} root="/delivery/releases" map={searchParams.map} />
    </>
  );
}

/**
 * The release map and table (051): the global list and a project's Releases section share them.
 * `root` is the list's path, `map` the Active/All choice; `projectKey` scopes the pins.
 */
export function ReleasesCards({ viewer, releases, now, root, map, projectKey }: { viewer: Viewer; releases: ReleaseRow[]; now: Date; root: string; map?: string; projectKey?: string }) {
  // 042: projects have their own environments; columns are the union in stage order.
  const envs = stageColumns(releases);
  const pinArgs = projectKey ? { projectKey } : {};
  return (
    <>
      <div className="card map scroll-x pinnable" style={{ marginBottom: 28 }}>
        <div className="card-head"><h2>Release map</h2><PinButton inline pin={{ label: "Release map", tool: "list_releases", args: pinArgs }} />
          <nav className="seg" aria-label="Range"><a href={root} aria-current={map !== "all" ? "true" : undefined}>Active</a><a href={`${root}?map=all`} aria-current={map === "all" ? "true" : undefined}>All</a></nav>
        </div>
        <ReleaseMap releases={map === "all" ? releases : onActiveMap(releases, now)} columns={envs} />
      </div>
      <div className="card flush pinnable">
        <div className="card-head"><h2>All releases</h2><PinButton inline pin={{ label: "All releases", tool: "list_releases", args: pinArgs }} /><IntentButton intent="delivery.new-release" label="New release" /></div>
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">All releases</caption>
            <thead><tr><th>Release</th><th>Project</th><th className="num">Proposals</th>{envs.map((e) => <th key={e}>{e}</th>)}<th className="num">Action</th></tr></thead>
            <tbody>
              {releases.map((r) => {
                // Per project: a PM elsewhere, Finance or Leadership see the stage, not a button.
                const act = actionFor(r, can(viewer, "delivery:deployment:record", { projectId: r.projectId }));
                return (
                  <tr key={r.id} className="pinnable">
                    <td data-label="Release"><a className="rowlink" href={releaseHref(r)}><b>{r.version}</b></a></td>
                    <td data-label="Project"><span className="dot" style={{ background: `var(--${r.projectColor})` }} /><a className="quiet" href={projectHref(r.projectKey)}>{r.projectName}</a></td>
                    <td data-label="Proposals" className="num">{r.proposals}</td>
                    {envs.map((e) => { const s = r.stages.find((x) => x.environment === e); return <td key={e} data-label={e}>{s ? cell(s) : <span className="muted" title="Not an environment of this project">n/a</span>}</td>; })}
                    <td data-label="" className="num">
                      {act.kind === "text" ? <span className="muted">{act.text}</span> : <span className="muted"><a className="rowlink" href={act.href} title={act.title}>{act.text}</a></span>}
                      <PinButton pin={releasePin(r)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
