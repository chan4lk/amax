import { facet, PinButton, type PinRef } from "@amax/ui";
import { releaseHref } from "../contracts";
import { day, releasePin, stagePin } from "../pins";
import { releaseBand, tasksBand, type ReleaseLike } from "./band";

// 081 amendment 4 (AC-42, revised 2026-11-04): the board leads with what its lanes don't already say: the release the
// sprint is heading for, environment by environment, and how far the tasks are, with who closed them. Each part pins;
// the release part links to its page (a read-only link). Nothing here repeats the page's summary or the lane counts.
type Props = {
  project: { key: string; name: string; pin: PinRef; nextRelease: string | null; health: string };
  releases: ReleaseLike[];
  done: number; total: number; closedBy: { agents: number; people: number; automation: number };
};

export const STAGE_WORD: Record<string, string> = { deployed: "Deployed", testing: "Testing", "rolled-back": "Rolled back", todo: "Not yet" };

type TrackStage = { environment: string; environmentId?: string; deploymentId?: string | null; isProd: boolean; status: string | null; at: string | null };

/**
 * A release's environment track: a shape, a name and a word per stage, and its date when `dated`. The board's band and the
 * proposal page draw the same one. Review 081 round 1 (R3): each step pins its own record (stagePin).
 */
export function StageTrack({ projectKey, version, stages, label, dated }: { projectKey: string; version: string; stages: TrackStage[]; label: string; dated?: boolean }) {
  return (
    <ol className="dv-track" aria-label={label}>
      {stages.map((s) => {
        const state = s.status ?? "todo";
        const pin = stagePin(projectKey, version, s);
        return (
          <li key={s.environment} className={`${state} pinnable`}>
            <Glyph kind={state} /><b>{s.environment}{s.isProd && !/^prod/i.test(s.environment) && <small> Prod</small>}</b>
            <small>{STAGE_WORD[state] ?? state}{dated && s.at ? `, ${day(s.at)}` : ""}</small>
            {pin && <PinButton pin={pin} />}
          </li>
        );
      })}
    </ol>
  );
}

export function BoardBand({ project, releases, done, total, closedBy }: Props) {
  const r = releaseBand(releases, project.nextRelease, project.health);
  const t = tasksBand(done, total, closedBy);
  if (!r && !t.total) return null;
  return (
    <div className="dv-band" role="group" aria-label={`${project.key} at a glance`}>
      {r && (
        <section className="card pinnable" aria-labelledby="dv-band-release">
          <PinButton pin={releasePin({ id: r.release.id, version: r.release.version, projectKey: project.key, projectName: project.name })} />
          <h2 className="k" id="dv-band-release">Next release</h2>
          <p className="fig"><a href={releaseHref({ projectKey: project.key, version: r.release.version })}>{r.release.version}</a>{" "}
            <span>{r.release.proposals} {r.release.proposals === 1 ? "proposal" : "proposals"}</span>{" "}
            <span className={`chip ${r.health === "On track" ? "good" : "warn"}`}>{r.health}</span></p>
          <StageTrack projectKey={project.key} version={r.release.version} stages={r.stages} label={r.sentence} />
        </section>
      )}
      {t.total > 0 && (
        <section className="card pinnable" aria-labelledby="dv-band-tasks">
          <PinButton pin={facet(project.pin, " tasks")} />
          <h2 className="k" id="dv-band-tasks">Tasks</h2>
          <p className="fig">{t.done} <span>of {t.total} done</span></p>
          <div className="bar" role="img" aria-label={t.sentence}>
            {([["agents", t.agents], ["people", t.people], ["automation", t.automation], ["unrecorded", t.unrecorded], ["open", t.open]] as const)
              .filter(([, n]) => n > 0).map(([k, n]) => <i key={k} className={k} style={{ flexGrow: n }} />)}
          </div>
          <ul className="legend">
            <li><span className="agents"><Glyph kind="agents" />Agents {t.agents}</span></li>
            <li><span className="people"><Glyph kind="people" />People {t.people}</span></li>
            {t.automation > 0 && <li><span className="automation"><Glyph kind="automation" />Automation {t.automation}</span></li>}
            {t.unrecorded > 0 && <li><span className="unrecorded"><Glyph kind="unrecorded" />Not recorded {t.unrecorded}</span></li>}
            <li><span className="open"><Glyph kind="open" />Open {t.open}</span></li>
          </ul>
        </section>
      )}
    </div>
  );
}

// A shape per state, so neither the legend nor the track relies on colour alone.
const SHAPES: Record<string, React.ReactNode> = {
  agents: <path d="M8 1.5l1.6 4.2 4.4.3-3.4 2.8 1.1 4.3L8 10.7l-3.7 2.4 1.1-4.3L2 6l4.4-.3z" />,
  people: <circle cx="8" cy="8" r="5" />,
  unrecorded: <path d="M3 8h10" fill="none" strokeWidth="2.2" />,
  automation: <path d="M3 3h10v10H3z" />,
  open: <circle cx="8" cy="8" r="4.6" fill="none" strokeWidth="1.8" />,
  todo: <circle cx="8" cy="8" r="4.6" fill="none" strokeWidth="1.8" />,
  deployed: <path d="M3.5 8.5l3 3 6-7" fill="none" strokeWidth="2.2" />,
  testing: <circle cx="8" cy="8" r="4" />,
  "rolled-back": <path d="M4 4l8 8M12 4l-8 8" fill="none" strokeWidth="2.2" />,
};
export const Glyph = ({ kind }: { kind: string }) => <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">{SHAPES[kind]}</svg>;
