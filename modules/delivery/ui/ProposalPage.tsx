import type { ReactNode } from "react";
import { can, type Viewer } from "@amax/auth";
import { facet, PinButton, Since } from "@amax/ui";
import { projectHref, releaseHref } from "../contracts";
import { eventPin, projectPin, proposalPin, taskPin } from "../pins";
import { Markdown } from "./Markdown";
import { proposalDetail, type EventKind, type ProposalDetail } from "../server/proposal-detail";
import { hasNoOwner } from "../server/readiness";
import { AskButton } from "./AskButton";
import { timeBand } from "./band";
import { COLOR, day } from "./parts";
import { ProposalActions } from "./ProposalActions";
import { proposalSuggestions, ProposalSuggestions } from "./ProposalSuggestions";
import { Stepper } from "./Stepper";
import { ProjectTabs } from "./ProjectSections";
import { STAGE_WORD, StageTrack } from "./BoardBand";

const h = (n: number) => `${Number(n.toFixed(2))} h`;
// The reason as a sentence of its own: "demo only" reads "Demo only.", never run into the next sentence.
const withdrawnBecause = (r: string | null) => {
  const t = (r ?? "its spec change was removed from the repo").trim();
  return `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}`;
};

// 081 amendment 4 (revised 2026-11-04, the client): who and when, as labelled facts with the names and dates set off,
// rather than one run-on sentence.
function Facts({ p }: { p: ProposalDetail }) {
  const made = p.source === "specclaw" ? "Synced" : "Made by hand";
  return (
    <dl className="dv-facts">
      <div className="pinnable"><dt>Project</dt><dd><span className="dot" style={{ background: COLOR[p.projectColor] }} /><a href={projectHref(p.project.key)}>{p.project.name}</a><PinButton inline pin={projectPin(p.project)} /></dd></div>
      <div><dt>Owner</dt><dd>{hasNoOwner(p) ? <span className="chip warn">Unassigned</span> : <b>{p.ownerName}</b>}</dd></div>
      <div><dt>{made}</dt><dd>{p.createdAt ? <b><time dateTime={p.createdAt}>{day(p.createdAt)}</time></b> : "–"}{p.source === "specclaw" && p.sourceRef && <small className="muted"> from <code>{p.sourceRef}</code></small>}</dd></div>
      {p.updatedAt && <div><dt>Updated</dt><dd><b><time dateTime={p.updatedAt}>{day(p.updatedAt)}</time></b> <small className="muted"><Since at={p.updatedAt} /></small></dd></div>}
    </dl>
  );
}

// AC-49: approved hours against the estimate, as a band. Hours past the estimate are their own part, never folded into 100%.
function TimeCard({ p, pin }: { p: ProposalDetail; pin: (l: string) => ReactNode }) {
  const t = timeBand(p.hours, p.estimateHours);
  return (
    <div className="card pinnable dv-time">
      <div className="card-head"><h2>Time</h2>{pin("time")}</div>
      <p className="fig">{t.figure} <span>{t.rest}</span></p>
      {t.estimate !== null && (
        <div className="bar" role="img" aria-label={t.sentence}>
          {t.within > 0 && <i className="within" style={{ flexGrow: t.within }} />}
          {t.over > 0 && <i className="over" style={{ flexGrow: t.over }} />}
          {t.left > 0 && <i className="left" style={{ flexGrow: t.left }} />}
        </div>
      )}
      {t.estimate !== null && <p className="dv-time-legend">{t.over > 0
        ? <span className="over"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5l6 11H2z" /></svg>{h(t.over)} over the estimate</span>
        : <span className="left">{h(t.left)} left of the estimate</span>}</p>}
      <p className="muted note">From approved timesheet entries logged against {p.key}.</p>
    </div>
  );
}

function ReleaseCard({ p, pin }: { p: ProposalDetail; pin: (l: string) => ReactNode }) {
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Release</h2>{pin("release")}</div>
      {p.release ? <>
        {/* Amendment 4: the stages say how far it got and the stepper when it was released, so this line names the release only. */}
        <p className="dv-rel"><a href={releaseHref({ projectKey: p.project.key, version: p.release })}>{p.release}</a></p>
        {/* The same environment track as the board's Next release: a shape and a word per stage, and its date. */}
        <StageTrack projectKey={p.project.key} version={p.release} stages={p.stages} dated
          label={`Environments: ${p.stages.map((s) => `${s.environment} ${STAGE_WORD[s.status ?? "todo"] ?? s.status}`).join(", ")}`} />
      </> : <p className="muted">Not in a release yet. Released means a release that contains it reached Prod.</p>}
    </div>
  );
}

// AC-51: open tasks first; the done ones fold into one row, open when every task is done.
// 081 amendment 11 (AC-99, AC-100): each task its own pinnable row, the ref in a fixed column.
function Tasks({ p, pin }: { p: ProposalDetail; pin: (l: string) => ReactNode }) {
  const open = p.tasks.filter((t) => !t.done);
  const done = p.tasks.filter((t) => t.done);
  const row = (t: ProposalDetail["tasks"][number]) => (
    <li key={t.ref} className="pinnable"><b>{t.ref}</b><span>{t.title}{t.done && t.doneAt && <small className="muted"> · {day(t.doneAt)}</small>}</span>
      <PinButton pin={taskPin({ ...t, proposalKey: p.key })} /></li>
  );
  return (
    <div className="card pinnable dv-tasks">
      <div className="card-head"><h2>Tasks</h2>{pin("tasks")}{open.length > 0 && <span className="muted small">{open.length} open</span>}</div>
      {p.tasks.length === 0 && <p className="muted">No tasks yet.</p>}
      {open.length > 0 && <ul className="dv-list dv-keyed">{open.map(row)}</ul>}
      {done.length > 0 && (
        <details className="dv-fold dv-done" open={open.length === 0}>
          <summary><span className="chip good">{open.length === 0 ? `All ${done.length} done` : `${done.length} done`}</span><span className="dv-chev" aria-hidden="true" /></summary>
          <ul className="dv-list dv-keyed">{done.map(row)}</ul>
        </details>
      )}
    </div>
  );
}

// AC-50: a timeline, newest first: a shape per kind, what happened, who, and an age that keeps counting (the exact
// time is its tooltip).
const KIND_SHAPE: Record<EventKind, ReactNode> = {
  created: <path d="M8 3v10M3 8h10" fill="none" strokeWidth="2" />,
  moved: <path d="M3 8h9M9 4.5L12.5 8 9 11.5" fill="none" strokeWidth="2" />,
  task: <path d="M3.5 8.5l3 3 6-7" fill="none" strokeWidth="2.2" />,
  reopened: <path d="M12.5 5.5A5 5 0 1 0 13 9M12.5 2v3.5H9" fill="none" strokeWidth="1.8" />,
  time: <><circle cx="8" cy="8" r="5.5" fill="none" strokeWidth="1.8" /><path d="M8 5v3.2l2 1.4" fill="none" strokeWidth="1.8" /></>,
  edited: <path d="M3 13l1-3.5L10.5 3l2.5 2.5L6.5 12z" fill="none" strokeWidth="1.6" />,
  withdrawn: <path d="M4 4l8 8M12 4l-8 8" fill="none" strokeWidth="2.2" />,
  synced: <path d="M3 6a5 5 0 0 1 9-1.5M13 10a5 5 0 0 1-9 1.5M12 2v3h-3M4 14v-3h3" fill="none" strokeWidth="1.6" />,
};

const TIME_NOTE = { unread: "Time logged against it isn't shown here: the Time module isn't running.", partial: "Time logged long ago against it wasn't read, so this history may leave some out." } as const;

function History({ p, pin }: { p: ProposalDetail; pin: (l: string) => ReactNode }) {
  return (
    <div className="card pinnable dv-history">
      <div className="card-head"><h2>History</h2>{pin("history")}</div>
      {/* 087 AC-8, AC-9: say when time lines may be missing, rather than imply none were logged. */}
      {p.timeNote && <p className="muted dv-time-note">{TIME_NOTE[p.timeNote]}</p>}
      {p.history.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
        <ol className="dv-timeline">
          {p.history.map((e) => (
            <li key={e.id} className={`${e.kind} pinnable`}>
              <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">{KIND_SHAPE[e.kind]}</svg>
              <span>{e.text}<small className="muted"><b>{e.by}</b></small></span>
              <small className="muted"><Since at={e.at} /></small>
              {/* Review round 1 (R3): each line pins itself, through get_proposal_event. */}
              <PinButton pin={eventPin({ proposalId: p.id, key: p.key, line: e.id, text: e.text })} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 081 AC-6: one proposal. Writes happen in chat, from the Ask amax buttons. */
export async function ProposalPage({ viewer, proposalKey }: { viewer: Viewer; proposalKey: string }) {
  const p = await proposalDetail(viewer, { key: proposalKey });
  if (!p) return <><nav className="crumb" aria-label="Breadcrumb"><a href="/delivery/proposals">Proposals</a></nav><h1>Proposal not found</h1><p className="lede">No proposal with the key {proposalKey}.</p></>;
  const ref = proposalPin(p);
  const pin = (label: string) => <PinButton inline pin={facet(ref, ` ${label}`)} />;
  const may = (perm: string) => can(viewer, perm, { projectId: p.project.id });
  // 081 AC-35: what the agent suggests about this proposal, first, for whoever may decide it (rule 6: attention first).
  const suggested = await proposalSuggestions(viewer, [p.id]);
  return (
    <>
      {/* 081 amendment 5 (AC-54): the trail follows the project, however the page was opened. */}
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery">Projects</a><span>/</span><a href={projectHref(p.project.key)}>{p.project.name}</a><span>/</span><a href={projectHref(p.project.key, "proposals")}>Proposals</a><span>/</span>{p.key}</nav>
      <div className="row head">
        <div className="pinnable"><h1>{p.key} {p.title}<PinButton inline pin={ref} /></h1><Facts p={p} /></div>
        <div className="actions">
          {/* AC-46: Ask amax (the pin offers Move, Edit, a task) and Withdraw; nothing else. */}
          <AskButton spark label="Ask amax" prompt={`About ${p.key} ${p.title}: `} pin={ref} />
          <ProposalActions p={p} may={may} />
        </div>
      </div>
      {/* 081 amendment 11 (AC-98): withdrawn is the first thing to know, so it sits under the title, as a warning. */}
      {p.withdrawn && <div className="dv-withdrawn" role="status"><span className="chip bad">Withdrawn</span><p>{withdrawnBecause(p.withdrawReason)} It no longer counts in lists, boards or releases.</p></div>}
      {/* AC-55: the project's tabs stay, Proposals current, so the board is one click away. */}
      <ProjectTabs projectKey={p.project.key} current="proposals" />
      <Stepper pin={ref} p={p} />
      <ProposalSuggestions {...suggested} />
      <div className="cols even gap-below"><TimeCard p={p} pin={pin} /><ReleaseCard p={p} pin={pin} /></div>
      <div className="card pinnable gap-below">
        <div className="card-head"><h2>Description</h2>{pin("description")}</div>
        {/* AC-103: Markdown reads as text. */}
        {p.description ? <Markdown text={p.description} /> : <p className="muted">{p.source === "specclaw" ? "The spec lives in the repo." : "No description yet."}</p>}
        {(p.meta as { pr?: string | null }).pr && <p><a href={(p.meta as { pr: string }).pr} rel="noreferrer">Pull request {(p.meta as { pr: string }).pr.split("/").at(-1)}</a></p>}
      </div>
      <div className="cols even"><Tasks p={p} pin={pin} /><History p={p} pin={pin} /></div>
    </>
  );
}
