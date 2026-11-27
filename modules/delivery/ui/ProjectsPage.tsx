import type { ScreenProps } from "@amax/core";
import { IntentButton, PinButton, Ticket } from "@amax/ui";
import { projectPin } from "../pins";
import { listProjects, weeklyThroughput } from "../server/queries";
import { ART_SPRITE } from "./art";
import { axisMax, Donut, LineChart } from "./charts";
import { marginLabel } from "../server/portfolio";
import { Avatar } from "./Avatar";
import { ClientFilter } from "./ClientFilter";
import { FilterMenu } from "./FilterMenu";
import { COLOR, initials, needViewer, shortName, SignInFirst, usd } from "./parts";

const HEALTH: Record<string, [string, string]> = { "on-track": ["good", "On track"], "at-risk": ["bad", "At risk"], "off-track": ["bad", "Off track"] };
const BILLING: Record<string, string> = { fixed: "fixed price", "t&m": "time and materials", retainer: "retainer", internal: "internal" };
const HEX: Record<string, string> = { violet: "#7B61FF", amber: "#F2A93B", pink: "#F48B9B", mint: "#2FCB8C" };
const AVATAR = ["a1", "a3", "a4", "a2"];
const art = (name: string) => <svg className="art" viewBox="0 0 120 110" aria-hidden="true"><use href={`#art-${name}`} /></svg>;
const k = (n: number) => `$${Math.round(n / 1000)}k`;
const version = (next: string | null) => next?.match(/v\d+(\.\d+)+/)?.[0];
/** "1 client", "3 clients": one count, pluralised on that same count (review round 1). */
export const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export async function ProjectsPage({ viewer: raw, searchParams = {} }: ScreenProps) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Projects</h1><SignInFirst /></>;
  const status = searchParams.status === "closed" ? "closed" : "active";
  const [all, weekly] = await Promise.all([listProjects(viewer, status), weeklyThroughput(viewer)]);
  const clients = [...new Set(all.map((p) => p.client))];
  const projects = searchParams.client ? all.filter((p) => p.client === searchParams.client) : all;
  const value = projects.reduce((n, p) => n + (p.contractValue ?? 0), 0);
  const invoiced = projects.reduce((n, p) => n + (p.invoiced ?? 0), 0);
  const margin = value ? projects.reduce((n, p) => n + (p.marginPct ?? 0) * (p.contractValue ?? 0), 0) / value : 0;
  const atRisk = projects.filter((p) => p.health !== "on-track");
  const onTrack = projects.find((p) => p.health === "on-track" && version(p.nextRelease));
  const pct = value ? Math.round((invoiced / value) * 100) : 0;
  const shownClients = new Set(projects.map((p) => p.client)).size;
  const noWeekly = weekly.done.every((d) => d === null) && weekly.planned.every((d) => d === null);
  // The axis grows with the data (40 at least, as in the mock), so no week is drawn past the top.
  const yMax = axisMax([...weekly.planned, ...weekly.done], 40, 10);
  const lede = [
    `${count(projects.length, `${status} project`)} for ${count(shownClients, "client")}.`,
    [atRisk.length ? `${atRisk.map((p) => p.name).join(" and ")} ${atRisk.length > 1 ? "are" : "is"} at risk` : "", onTrack ? `${onTrack.name} is on track for ${version(onTrack.nextRelease)}` : ""].filter(Boolean).join("; "),
  ].join(" ") + (atRisk.length || onTrack ? "." : "");
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: ART_SPRITE }} />
      <div className="row head">
        <div><h1>Projects</h1><p className="lede">{lede}</p></div>
        <div className="actions"><ClientFilter clients={clients} current={searchParams.client} /><IntentButton intent="delivery.new-project" label="New project" quiet /></div>
      </div>
      <div className="tickets four">
        <Ticket tone="info" label={`${status === "active" ? "Active" : "Closed"} projects`} value={String(projects.length)} note={`For ${count(shownClients, "client")}`} art={art("rocket")} />
        <Ticket tone="info" label="Contract value" value={usd(value)} progress={{ percent: pct, label: `${pct}% of ${k(value)} invoiced` }} art={art("coins")} />
        <Ticket tone="good" label="Average margin" value={`${margin.toFixed(1)}%`} note={`Revenue-weighted, ${margin >= 35 ? "above" : "below"} the 35% target`} art={art("chart")} />
        <Ticket tone="problem" label="At risk" value={count(atRisk.length, "project")} note={atRisk.map((p) => `${p.name}${p.riskPct ? `, ${p.riskPct}% risk` : ""}`).join("; ") || "None"} art={art("target")} />
      </div>
      <div className="cols even" style={{ marginBottom: 28 }}>
        <div className="card pinnable">
          <div className="card-head"><h2>Tasks done per week</h2><PinButton inline pin={{ label: "Tasks done per week", tool: "list_projects", args: {} }} /><span className="muted" style={{ fontSize: 13 }}>All projects</span></div>
          {noWeekly ? <p className="muted empty">No weekly task data yet. It appears once task events are ingested.</p> : (
            <LineChart id="tasksWeek" label="Tasks done per week against plan" labels={weekly.labels} max={yMax} step={10}
              series={[{ name: "Planned", color: "#C3B5FF", data: weekly.planned, dashed: true }, { name: "Done", color: "#7B61FF", data: weekly.done, area: true }]} />)}
          <div className="legend"><span><i style={{ background: "var(--violet)" }} />Done</span><span><i style={{ background: "repeating-linear-gradient(90deg,#C3B5FF 0 5px,transparent 5px 9px)" }} />Planned</span></div>
        </div>
        <div className="card pinnable">
          <div className="card-head"><h2>Revenue by project</h2><PinButton inline pin={{ label: "Revenue by project", tool: "list_projects", args: {} }} /><a className="btn sm pillbtn" href="/delivery">View all</a></div>
          <Donut label="Revenue by project" center={k(value)} sub="contract value" parts={projects.filter((p) => p.contractValue).map((p) => ({ name: p.name, value: p.contractValue!, color: HEX[p.color] ?? "#7B61FF" }))} />
        </div>
      </div>
      <div className="card flush pinnable">
        <div className="card-head">
          <h2>Portfolio</h2><PinButton inline pin={{ label: "Portfolio", tool: "list_projects", args: {} }} />
          <div className="actions">
            <nav className="seg" aria-label="Status">
              <a href="/delivery" aria-current={status === "active" ? "true" : undefined}>Active</a>
              <a href="/delivery?status=closed" aria-current={status === "closed" ? "true" : undefined}>Closed</a>
            </nav>
            <FilterMenu label="Filter by client" options={["", ...clients].map((c) => ({ text: c || "All clients", current: (searchParams.client ?? "") === c, href: `/delivery?${new URLSearchParams({ ...(status === "closed" ? { status } : {}), ...(c ? { client: c } : {}) })}` }))} />
          </div>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <caption className="sr">Portfolio</caption>
            <thead><tr><th>Project</th><th>Manager</th><th>Sprint</th><th style={{ minWidth: 170 }}>Progress</th><th>Health</th><th className="num">Margin</th><th>Next release</th><th className="num"><span className="sr">Actions</span></th></tr></thead>
            <tbody>
              {projects.map((p, i) => {
                const done = p.sprintTotal ? Math.round((p.sprintDone / p.sprintTotal) * 100) : 0;
                const [tone, label] = HEALTH[p.health];
                return (
                  <tr key={p.id} className="pinnable">
                    <td data-label="Project"><a className="rowlink" href={`/delivery/p/${p.key}`}><span className="dot" style={{ background: COLOR[p.color] }} /><b>{p.name}</b></a><small>{p.client}, {BILLING[p.billing]}</small></td>
                    <td data-label="Manager">{p.managerName ? <div className="who"><Avatar initials={initials(p.managerName)} name={p.managerName} tone={AVATAR[i % AVATAR.length]} />{shortName(p.managerName)}</div> : <span className="muted">No manager</span>}</td>
                    <td data-label="Sprint">{p.sprint ?? "–"}{p.openProposals !== null && <small>{p.openProposals} open</small>}</td>
                    <td data-label="Progress">{p.agentFirst && !p.openProposals ? <span className="muted">Nothing open</span> : <div className="row"><div className="meter" style={{ flex: 1 }}><i style={{ width: `${done}%`, background: done > 75 ? "var(--mint)" : COLOR[p.color] }} /></div>{p.sprintDone} of {p.sprintTotal}</div>}</td>
                    <td data-label="Health"><span className={`chip ${tone}`} title={p.healthReason ? `${label}: ${p.healthReason}` : undefined}>{label}</span>{p.healthReason && <small>{p.healthReason}</small>}</td>
                    <td data-label="Margin" className={p.billing === "internal" ? "num muted" : "num"}>{marginLabel(p.billing, p.marginPct)}</td>
                    <td data-label="Next release">{p.nextRelease ?? "–"}{p.nextReleaseNote && <small>{p.nextReleaseNote}</small>}</td>
                    <td data-label="" className="num"><a className="btn sm" href={`/delivery/p/${p.key}`}>Open board</a><PinButton pin={projectPin(p)} /></td>
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
