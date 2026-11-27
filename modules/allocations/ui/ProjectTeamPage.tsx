import type { ScreenProps } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import { PROJECT_HEADER_SLOT, type ProjectHeaderSlot } from "@amax/delivery/contracts";
import { provided } from "@amax/core/server";
import { Card, EmptyState, PinButton } from "@amax/ui";
import { monthLabel } from "../server/months";
import { teamFor, type ProjectTeam } from "../server/team";
import { AskButton } from "./AskButton";
import "./allocations.css";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

function ManagerRow({ team }: { team: ProjectTeam }) {
  const { project, manager } = team;
  return (
    <div className="team-lead pinnable">
      {manager ? <><span className="av" aria-hidden="true">{initials(manager.name)}</span>
        <div className="team-lead-who"><b>{manager.name}</b><small>Project manager</small></div>
        {manager.inactive && <span className="chip warn">Account deactivated · needs a new PM</span>}</>
        : <span className="muted">No project manager yet</span>}
      <PinButton inline pin={{ label: `${project.name} PM`, tool: "get_project", args: { projectId: project.id } }} />
    </div>
  );
}

function TeamCard({ team }: { team: ProjectTeam }) {
  const { project, manager, months, people, hidden } = team;
  return (
    <div className="card flush pinnable team-card">
      <div className="card-head start"><h2>Team</h2><PinButton inline pin={{ label: `${project.name} team`, tool: "get_project_team", args: { projectKey: project.key } }} /><span className="note">From allocations</span></div>
      <ManagerRow team={team} />
      {people.length ? (
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">Team allocated to {project.name}</caption>
            <thead><tr><th>Person</th><th>Role</th>{months.map((m) => <th key={m} className="num">{monthLabel(m)}</th>)}</tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.personId} className="pinnable">
                  <td data-label="Person">{p.name}{manager && !manager.inactive && p.userId === manager.userId && <> <span className="chip pm">PM</span></>}{p.standing && <> <span className="chip info">until further notice</span></>}</td>
                  <td data-label="Role">{p.role}</td>
                  {p.percents.map((n, i) => <td key={months[i]} data-label={monthLabel(months[i])} className="num">{n === null ? <span className="muted">–</span> : `${n}%`}{i === months.length - 1 && <PinButton pin={{ label: `${p.name} on ${project.name}`, tool: "get_project_team", args: { projectKey: project.key, person: p.employeeNo } }} />}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon="people" title="Nobody is allocated here" hint={`No one has time on ${project.name} from ${monthLabel(months[0], "long")} to ${monthLabel(months[2], "long")}.`} />}
      {hidden > 0 && <p className="muted note" style={{ padding: "0 28px 20px" }}>{hidden} more {hidden === 1 ? "person is" : "people are"} allocated here outside your HR access.</p>}
    </div>
  );
}

export async function ProjectTeamPage({ viewer: raw, params }: ScreenProps) {
  const viewer = raw as Viewer | null;
  if (!viewer) return <><h1>Team</h1><Card><EmptyState icon="people" title="Sign in to see the team" hint="Allocations come from the database once you're signed in." /></Card></>;
  if (!can(viewer, "allocations:read")) return <><h1>Team</h1><Card><EmptyState icon="people" title="Allocations aren't open to your role" hint="Ask a PM or HR for who is on this project." /></Card></>;
  if (!can(viewer, "delivery:read")) return <><h1>Team</h1><Card><EmptyState icon="people" title="Projects aren't open to your role" hint="Ask a PM or an Admin for who is on this project." /></Card></>;
  const team = await teamFor(viewer, params.key);
  const slot = provided<ProjectHeaderSlot>(PROJECT_HEADER_SLOT)[0];
  const head = team && slot ? await slot.load(viewer, team.project.key) : null;
  if (!team || !slot || !head) return <><h1>Project not found</h1><p className="lede">No project with the key {params.key}.</p></>;
  const { key, name } = team.project;
  const action = can(viewer, "allocations:allocate", { projectId: team.project.id })
    ? <AskButton className="btn sm primary" label={`Ask amax · Add someone to ${key}`} prompt={`Add someone to ${key}`} pin={{ label: `${name} team`, tool: "get_project_team", args: { projectKey: key } }} />
    : undefined;
  return <><slot.Header head={head} section="team" title="Team" actions={action} /><TeamCard team={team} /></>;
}
