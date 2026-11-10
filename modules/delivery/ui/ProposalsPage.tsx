import type { ScreenProps } from "@amax/core";
import { PinButton } from "@amax/ui";
import { PHASES, projectHref, proposalHref, proposalKeyFrom, releaseHref, type Phase } from "../contracts";
import { metricsPin, projectPin, proposalPin } from "../pins";
import { listProjects, listProposals, manualProjects, phaseCounts, shippedPerWeek, type ProposalRow } from "../server/queries";
import { BarChart } from "./charts";
import { csvHref } from "./csv";
import { FilterMenu } from "./FilterMenu";
import { NewProposalButton } from "./NewProposalButton";
import { AgentFirstLine } from "./AgentFirstLine";
import { proposalsAction } from "./proposals-action";
import { shippedToLabel } from "./released";
import { COLOR, needViewer, PHASE_UI, PhaseChip, SignInFirst, Stk } from "./parts";
import { ProposalPage } from "./ProposalPage";
import { ProposalSearch } from "./ProposalSearch";
import { attention, isNeed, NEED_LABEL, suggestedIds, type Need } from "../server/attention";
import { hasNoOwner } from "../server/readiness";
import { AttentionStrip, listQuery, needPin } from "./Attention";

// 081 AC-15: every phase of the lifecycle, Planned included.
const FILTERS: (Phase | "all")[] = ["all", ...PHASES];
const PAGE = 20;
// 081 amendment 11 (AC-97): each reason's chip colour.
const NEED_CHIP: Record<Need, string> = { suggested: "agent", ready: "good", over: "bad", unassigned: "warn" };

export async function ProposalsPage({ viewer: raw, params, searchParams = {} }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Proposals</h1><SignInFirst /></>;
  // 081: /delivery/proposals/:key shares the segment with the phase filter; anything that isn't a phase is a key.
  if (params.phase && !(PHASES as readonly string[]).includes(params.phase)) return ProposalPage({ viewer, proposalKey: proposalKeyFrom(params.phase) });
  const phase = (PHASES as readonly string[]).includes(params.phase ?? "") ? (params.phase as Phase) : undefined;
  const asked = Math.max(1, Number(searchParams.page ?? 1) || 1);
  // 081 AC-16: the cards and the table read through one filter, so they always agree.
  const projectKey = searchParams.project || undefined;
  // 081 amendment 9 (AC-87): Mine narrows the cards and the table alike, as the project filter does.
  const mine = searchParams.owner === "me";
  const ownerUserId = mine ? viewer.userId : undefined;
  const [counts, rows, shipped, projects] = await Promise.all([phaseCounts(viewer, undefined, { projectKey, ownerUserId }), listProposals(viewer, { phase, projectKey, q: searchParams.q, ownerUserId }),
    shippedPerWeek(viewer, undefined, { projectKey, ownerUserId }), listProjects(viewer, "active")]);
  const bar: [Phase, number, string][] = [["proposed", counts.proposed, "Proposed"], ["planned", counts.planned, "Planned"], ["building", counts.building, "Building"], ["verified", counts.verified, "Verified"], ["released", counts.releasedThisMonth, `Released in ${counts.month}`]];
  const recent = shipped.values.slice(-4).reduce((a, b) => a + b, 0), prior = shipped.values.slice(0, 4).reduce((a, b) => a + b, 0);
  const trend = prior ? ((recent - prior) / prior) * 100 : null;
  const filtered = projects.find((p) => p.key === searchParams.project);
  // 093 AC-2: "New proposal" only where the viewer may create by hand: a project that isn't agent-first.
  const manual = await manualProjects(viewer);
  const action = proposalsAction(projects, manual.map((p) => p.key), filtered);
  // 081 amendment 11 (AC-96, AC-97): what needs attention leads; its counts follow every filter but need itself.
  const need = isNeed(searchParams.need) ? searchParams.need : undefined;
  const att = attention(rows, await suggestedIds(viewer, rows));
  const base = phase ? `/delivery/proposals/${phase}` : "/delivery/proposals";
  return (
    <>
      <div className="row head">
        <div><h1>Proposals</h1><p className="lede">Every specclaw change across your projects, with the time spent on it and how far it has shipped.</p></div>
        {action.kind === "repo-line" ? <div className="actions"><AgentFirstLine repoUrl={action.repoUrl} />{action.addByHand && <NewProposalButton secondary />}</div>
          : action.kind === "new-proposal" && <div className="actions"><NewProposalButton project={filtered ? { pin: projectPin(filtered), name: filtered.name } : undefined} /></div>}
      </div>
      <AttentionStrip counts={att.counts} active={need} href={(n) => `${base}${listQuery({ project: projectKey, q: searchParams.q, owner: mine ? "me" : undefined, need: n })}`}
        pin={(n) => needPin(n, { projectKey: filtered?.key, projectName: filtered?.name, mine })} />
      <div className="cols even gap-below">
        <div className="card pinnable">
          <div className="card-head"><h2>Proposals by phase</h2><PinButton inline pin={metricsPin("Proposals by phase", filtered)} /><span className="muted small">{counts.inFlight} in flight</span></div>
          <div className="phasebar" role="img" aria-label={bar.map(([, n, l]) => `${l} ${n}`).join(", ")}>
            {bar.map(([p, n]) => n > 0 && <i key={p} style={{ flex: n, background: PHASE_UI[p].color }} />)}
          </div>
          <ul className="phase-legend">{bar.map(([p, n, l]) => <li key={p}><Stk phase={p} />{l}<b>{n}</b></li>)}</ul>
        </div>
        <div className="card pinnable">
          <div className="card-head"><h2>Shipped to Prod per week</h2><PinButton inline pin={metricsPin("Shipped to Prod per week", filtered)} />{trend !== null && <span className={trend >= 0 ? "up" : "down"}>{trend >= 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%</span>}</div>
          <BarChart label="Proposals shipped to Prod per week" labels={shipped.labels} values={shipped.values} max={Math.max(8, Math.ceil(Math.max(...shipped.values) / 2) * 2)} />
        </div>
      </div>
      <ProposalsTable rows={att.ordered} needs={att.needs} need={need} me={viewer.userId} phase={phase} root="/delivery/proposals" project={projectKey} q={searchParams.q} page={asked} projects={projects} mine={mine} />
    </>
  );
}

/**
 * The proposals table with its phase filters, export and pages (051): the global list and a
 * project's Proposals section share it. `root` is the list's path; `projects` adds the project filter.
 */
/** 081 AC-16: the project the list is filtered to, beside Filter; its ✕ goes back to all projects, keeping phase and search. */
function FilterChip({ name, href, clears = "all projects" }: { name: string; href: string; clears?: string }) {
  return (
    <a className="filter-chip" href={href} aria-label={`Filtered to ${name}. Remove this filter to show ${clears}`}>
      {name}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </a>
  );
}

export function ProposalsTable({ rows: all, needs, need, me, phase, root, project, q, page: asked, projects, title, mine = false }: { rows: ProposalRow[]; needs?: Map<string, Need[]>; need?: Need; me?: string; phase?: Phase; root: string; project?: string; q?: string; page: number; projects?: { key: string; name: string }[]; title?: string; mine?: boolean }) {
  // 081 amendment 11 (AC-96): a tile's need narrows the table only.
  const rows = need && needs ? all.filter((p) => needs.get(p.id)?.includes(need)) : all;
  const page = Math.min(asked, Math.max(1, Math.ceil(rows.length / PAGE)));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const base = phase ? `${root}/${phase}` : root;
  // Filters, search and pages keep each other: a link changes one of them and carries the rest.
  // 081 amendment 9 (AC-87): Mine (owner=me) is one more filter the others carry; it lives in the Filter menu, so the
  // bar itself is unchanged until it's on, when its chip clears it.
  const owner = mine ? "me" : undefined;
  const query = (o: { project?: string; q?: string; page?: number; owner?: string; need?: string }) => listQuery({ ...o, need: "need" in o ? o.need : need });
  const empty = q ? `No proposals match “${q}”` : need ? `No proposals need this: ${NEED_LABEL[need].toLowerCase()}` : "No proposals yet";
  const href = (p: number) => `${base}${query({ project, q, owner, page: p })}`;
  const projectOptions = projects ? [{ key: "", name: "All projects" }, ...projects].map((p) => ({ text: p.name, current: (project ?? "") === p.key, href: `${base}${query({ project: p.key, q, owner })}` })) : [];
  return (
    <div className="card flush pinnable">
      {/* 081 amendment 11 (AC-102): the phase tabs on one row; the filter, its chips, search and Export on the next. */}
      <div className="card-head list-head">
        <div className="list-head-top">
          {title && <h2>{title}</h2>}
          <nav className="seg" aria-label="Phase">
            {FILTERS.map((f) => (
              <a key={f} href={`${f === "all" ? root : `${root}/${f}`}${query({ project, q, owner })}`} aria-current={(f === "all" ? !phase : phase === f) ? "true" : undefined}>{f === "all" ? "All" : f === "released" ? "Released, all time" : PHASE_UI[f].label}</a>
            ))}
          </nav>
        </div>
        <div className="actions">
          {/* Product owner, 2026-11-05: "My proposals" second, right below All projects. */}
          <FilterMenu label={projects ? "Filter by project or owner" : "Filter by owner"} options={[...projectOptions.slice(0, 1), { text: "My proposals", current: mine, href: `${base}${query({ project, q, owner: mine ? undefined : "me" })}` }, ...projectOptions.slice(1)]} />
          {projects && project && <FilterChip name={projects.find((p) => p.key === project)?.name ?? project} href={`${base}${query({ q, owner })}`} />}
          {mine && <FilterChip name="Mine" href={`${base}${query({ project, q })}`} clears="everyone's proposals" />}
          {need && <FilterChip name={NEED_LABEL[need]} href={`${base}${query({ project, q, owner, need: undefined })}`} clears="every proposal" />}
          <ProposalSearch base={base} project={project} q={q} owner={owner} need={need} options={rows.map((p) => ({ key: p.key, title: p.title }))} />
          <a className="btn" href={csvHref([["Proposal", "Title", "Project", "Phase", "Tasks done", "Tasks", "Hours", "Release", "Shipped to", "Owner"], ...rows.map((p) => [p.key, p.title, p.projectName, p.phase, String(p.tasksDone), String(p.tasksTotal), String(p.hours), p.release ?? "", shippedToLabel(p) ?? "", p.ownerName ?? ""])])} download="proposals.csv">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg>Export
          </a>
        </div>
      </div>
      <div className="scroll-x">
        <table className="tbl">
          <caption className="sr">Proposals</caption>
          <thead><tr><th>Proposal</th><th>Project</th><th>Phase</th><th>Tasks</th><th className="num">Time</th><th>Release</th><th>Shipped to</th><th>Owner</th></tr></thead>
          <tbody>
            {/* AC-101: nothing matched says so inside the table. */}
            {shown.length === 0 && <tr><td colSpan={8} className="muted">{empty}</td></tr>}
            {shown.map((p) => {
              const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0;
              return (
                <tr key={p.id} className="pinnable">
                  {/* AC-97, AC-100: the key in its own column with the title beside it, then why it needs attention and whether it's yours. */}
                  <td data-label="Proposal" className="prop-cell"><a href={proposalHref(p.key)}><b>{p.key}</b> {p.title}</a>
                    {((needs?.get(p.id)?.length ?? 0) > 0 || (me !== undefined && p.ownerUserId === me)) && <span className="prop-tags">
                      {needs?.get(p.id)?.map((n) => <span key={n} className={`chip ${NEED_CHIP[n]}`}>{NEED_LABEL[n]}</span>)}
                      {me !== undefined && p.ownerUserId === me && <span className="chip yours">Yours</span>}
                    </span>}</td>
                  <td data-label="Project"><span className="dot" style={{ background: COLOR[p.projectColor] }} /><a className="quiet" href={projectHref(p.projectKey)}>{p.projectName}</a></td>
                  <td data-label="Phase"><PhaseChip phase={p.phase} /></td>
                  <td data-label="Tasks">{p.tasksTotal > 0 ? <div className="meter" role="img" aria-label={`${p.tasksDone} of ${p.tasksTotal} tasks`}><i style={{ width: `${pct}%`, background: pct === 100 ? "var(--mint)" : "var(--violet)" }} /></div> : <span className="muted">–</span>}</td>
                  <td data-label="Time" className="num">{Number(p.hours.toFixed(2))} h</td>
                  <td data-label="Release">{p.release ? <a className="quiet" href={releaseHref({ projectKey: p.projectKey, version: p.release })}>{p.release}</a> : <span className="muted">None</span>}</td>
                  <td data-label="Shipped to">{p.phase === "released" ? <span className={shippedToLabel(p) === "Prod" ? "chip good" : "chip"}>{shippedToLabel(p)}</span> : p.shippedTo ? p.shippedTo : <span className="muted">Not yet</span>}</td>
                  <td data-label="Owner">{hasNoOwner(p) ? <span className="muted">Unassigned</span> : p.ownerName}<PinButton pin={proposalPin(p)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav className="row pager" aria-label="Pages">
        <span className="muted small">{rows.length ? `${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, rows.length)} of ${rows.length}` : "0 proposals"}</span>
        <span className="actions">
          {page > 1 && <a className="btn sm" href={href(page - 1)}>Previous</a>}
          {page * PAGE < rows.length && <a className="btn sm" href={href(page + 1)}>Next</a>}
        </span>
      </nav>
    </div>
  );
}
