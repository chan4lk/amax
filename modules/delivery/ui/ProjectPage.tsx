import { can } from "@amax/auth";
import { releasedLabel } from "./released";
import type { ScreenProps } from "@amax/core";
import { PinButton } from "@amax/ui";
import { PHASES, proposalHref, type Phase } from "../contracts";
import { projectPin, proposalPin } from "../pins";
import { getProject, listEnvironments, listReleases, type ProposalRow } from "../server/queries";
import { hasNoOwner } from "../server/readiness";
import { proposalSuggestions } from "./ProposalSuggestions";
import { NewProposalButton } from "./NewProposalButton";
import { AgentFirstLine } from "./AgentFirstLine";
import { Avatar } from "./Avatar";
import { EnvironmentsCard } from "./EnvironmentsCard";
import { getRepoSync } from "../server/repo-sync";
import { RepoSyncCard } from "./RepoSyncCard";
import { initials, needViewer, SignInFirst, Stk } from "./parts";
import { ProjectTabs } from "./ProjectSections";
import { BoardBand } from "./BoardBand";

const D = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
// "Sprint 18 runs Mon Oct 12 to Fri Oct 23. " The task count, the next release and its health are the band's (081
// amendment 4), not repeated here.
function sprintLine(p: { sprint: string | null; sprintStart: string | null; sprintEnd: string | null }) {
  if (!p.sprint) return "";
  const when = p.sprintStart && p.sprintEnd ? ` runs ${D(p.sprintStart, { weekday: "short", month: "short", day: "numeric" }).replace(",", "")} to ${D(p.sprintEnd, { weekday: "short", month: "short", day: "numeric" }).replace(",", "")}` : "";
  return `${p.sprint}${when}. `;
}

const LANE_LABEL: Record<Phase, string> = { proposed: "Proposed", planned: "Planned", building: "Building", verified: "Verified", released: "Released to Prod" };

// Facts the specclaw sync adds (039): lane, queue status, claim, PR.
function SpecFacts({ p }: { p: ProposalRow }) {
  const m = p.meta as { lane?: string; status?: string; waiting?: string[]; claim?: string | null; pr?: string | null; withdrawn?: boolean };
  const status = p.withdrawn ? "withdrawn" : m.status === "blocked" ? `blocked on ${m.waiting?.join(", ")}` : m.status === "claimed" ? `claimed by ${m.claim}` : m.status === "ready" ? "ready" : null;
  return (
    <div className="foot" style={{ marginTop: 8 }}>
      {m.lane && <span className="chip">{m.lane}</span>}
      {status && status !== "done" && <span className={`chip ${m.status === "ready" ? "good" : m.status === "claimed" ? "agent" : "warn"}`}>{status}</span>}
      {m.pr && <a href={m.pr} rel="noreferrer">PR {m.pr.split("/").at(-1)}</a>}
    </div>
  );
}

function Card({ p, suggested, mine = false }: { p: ProposalRow; suggested: boolean; mine?: boolean }) {
  const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : 0;
  const done = p.phase === "verified" || p.phase === "released";
  const pin = proposalPin(p);
  return (
    <div className="tcard pinnable">
      <PinButton pin={pin} />
      <div className="id">{p.key}</div>
      <p><a href={proposalHref(p.key)}>{p.title}</a></p>
      {p.tasksTotal > 0 && p.phase !== "released" && <div className="prog" role="img" aria-label={`${p.tasksDone} of ${p.tasksTotal} tasks`}><i style={{ width: `${pct}%`, ...(done ? { background: "var(--mint)" } : {}) }} /></div>}
      <div className="foot">
        {p.phase === "released" ? <span className="chip">{p.release ?? "Released"}</span>
          // 081 amendment 9 (AC-90): your own card says so, beside the initials or the agent that made it (most of an
          // engineer's proposals are made by an agent for them; found in the end-to-end demo).
          : mine ? <span className="mine">{p.agent ? <span className="chip agent">{p.agent}</span> : <Avatar initials={initials(p.ownerName)} name={hasNoOwner(p) ? "Unassigned" : p.ownerName ?? ""} />}<span className="chip yours">Yours</span></span>
          : p.agent ? <span className="chip agent">{p.agent}</span>
          : <Avatar initials={initials(p.ownerName)} name={hasNoOwner(p) ? "Unassigned" : p.ownerName ?? ""} />}
        <span>
          {p.phase === "proposed" && `${p.estimateHours !== null ? `est. ${p.estimateHours} h` : `${p.hours} h`}${p.tasksTotal ? ` · ${p.tasksDone} of ${p.tasksTotal} tasks` : ""}`}
          {(p.phase === "planned" || p.phase === "building") && (p.tasksTotal ? `${p.tasksDone} of ${p.tasksTotal}${p.phase === "building" ? `, ${p.hours} h` : " tasks"}` : `No tasks yet${p.phase === "building" ? `, ${p.hours} h` : ""}`)}
          {p.phase === "verified" && p.source !== "specclaw" && <span className="chip">{p.release ?? "No release"}{p.shippedTo ? `, in ${p.shippedTo}` : ""}</span>}
          {p.phase === "verified" && p.source === "specclaw" && `${p.tasksDone} of ${p.tasksTotal} tasks`}
          {p.phase === "released" && <span className={releasedLabel(p).prod ? "chip good" : "chip"}>{releasedLabel(p).text}</span>}
        </span>
      </div>
      {suggested && <div className="foot" style={{ marginTop: 8 }}><a className="chip agent" href={proposalHref(p.key)} aria-label={`amax suggests something for ${p.key}: open it`}>amax suggests</a></div>}
      {p.source === "specclaw" && <SpecFacts p={p} />}
    </div>
  );
}

export async function ProjectPage({ viewer: raw, params }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Project</h1><SignInFirst /></>;
  const data = await getProject(viewer, params.key);
  if (!data) return <><h1>Project not found</h1><p className="lede">No project with the key {params.key}.</p></>;
  const { project, proposals, closedBy } = data;
  // 081 AC-35: a card with an open agent suggestion the viewer may decide says so, and opens the proposal to decide it.
  const suggested = new Set((await proposalSuggestions(viewer, proposals.map((x) => x.id))).open.map((s) => s.target.id));
  const envs = await listEnvironments(viewer, project.key);
  const releases = await listReleases(viewer, { projectKey: project.key });
  const sync = await getRepoSync(viewer, { projectId: project.id });
  const canLink = can(viewer, "delivery:project:link", { projectId: project.id });
  const syncFirst = !!sync && canLink && sync.recent.some((p) => p.outcome === "refused");
  const repoSync = sync && <RepoSyncCard projectKey={project.key} projectId={project.id} repoUrl={sync.repoUrl} last={sync.lastApplied} recent={sync.recent} canLink={canLink} first={syncFirst} />;

  // Synced projects have no sprint counters; their progress is the proposals' tasks.
  const done = project.sprintTotal ? project.sprintDone : proposals.reduce((n, p) => n + p.tasksDone, 0);
  const total = project.sprintTotal || proposals.reduce((n, p) => n + p.tasksTotal, 0);
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery">Projects</a><span>/</span>{project.name}</nav>
      <div className="row head">
        <div>
          <h1>{project.name}</h1>
          <p className="lede">{sprintLine(project)}Released means it reached {envs.find((e) => e.isProd)?.name ?? "Prod"}.</p>
        </div>
        <div className="actions">
          {project.sprint && <select className="select" aria-label="Sprint" defaultValue={project.sprint}><option>{project.sprint}</option></select>}
          {project.agentFirst && project.repoUrl ? <AgentFirstLine repoUrl={project.repoUrl} />
            : can(viewer, "delivery:proposal:create", { projectId: project.id }) && <NewProposalButton project={{ pin: projectPin(project), name: project.name }} />}
        </div>
      </div>
      <ProjectTabs projectKey={project.key} current="" />
      {/* 081 amendment 4 (AC-44, revised): a refused push leads the page, open, for whoever can fix it; otherwise Repo
          sync waits folded at the bottom. Agent suggestions are the cards' "amax suggests" chips. */}
      {syncFirst && repoSync}
      <BoardBand project={{ key: project.key, name: project.name, pin: projectPin(project), nextRelease: project.nextRelease, health: project.health }} releases={releases} done={done} total={total} closedBy={closedBy} />
      <div className="board">
        {PHASES.map((phase) => {
          const cards = proposals.filter((p) => p.phase === phase);
          return (
            <section className="lane" key={phase} aria-label={`${LANE_LABEL[phase]}, ${cards.length}`}>
              <div className="lane-head"><span className="lh"><Stk phase={phase} />{LANE_LABEL[phase]}</span> <span>{cards.length}</span></div>
              {cards.map((p) => <Card key={p.id} p={p} suggested={suggested.has(p.id)} mine={p.ownerUserId === viewer.userId} />)}
            </section>
          );
        })}
      </div>
      {!syncFirst && repoSync}
      <EnvironmentsCard projectKey={project.key} envs={envs} canEdit={can(viewer, "delivery:release:create", { projectId: project.id })} />
    </>
  );
}
