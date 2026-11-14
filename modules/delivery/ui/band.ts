import { PHASES, type Phase } from "../contracts";
import type { EventKind } from "../server/proposal-detail";

// 081 amendment 4: the figures behind the board's band, the proposal's stepper and its Time band, kept pure so each is
// tested on its own and the pages only lay them out.

/**
 * AC-42 Tasks: done of total, the done ones split by who closed them. Only some closes are recorded per task (a synced
 * project's counters come from the repo), so what isn't recorded shows as its own part rather than being guessed.
 */
export function tasksBand(done: number, total: number, closedBy: { agents: number; people: number; automation?: number }) {
  const agents = Math.min(closedBy.agents, done);
  const people = Math.min(closedBy.people, done - agents);
  const automation = Math.min(closedBy.automation ?? 0, done - agents - people);
  const unrecorded = done - agents - people - automation;
  const open = Math.max(0, total - done);
  const parts = [`${agents} by agents`, `${people} by people`, ...(automation ? [`${automation} by automation`] : []), ...(unrecorded ? [`${unrecorded} not recorded`] : []), `${open} open`];
  return { done, total, agents, people, automation, unrecorded, open, sentence: `${done} of ${total} tasks done: ${parts.join(", ")}` };
}

export type Step = { phase: Phase; state: "done" | "current" | "todo" | "withdrawn"; at: string | null };

/**
 * AC-47: the five phases, each done, current or to do. A done step carries the date the proposal last entered it
 * (Proposed: when it was made; Released: when it reached Prod). A withdrawn proposal crosses out the step it was in.
 */
export function stepsOf(p: { phase: Phase; withdrawn: boolean; createdAt: string | null; releasedAt: string | null; history: { kind: EventKind; to?: string; at: string }[] }): Step[] {
  const at = (phase: Phase) => {
    if (phase === "released" && p.releasedAt) return p.releasedAt;
    const moved = p.history.filter((h) => h.kind === "moved" && h.to === phase).map((h) => h.at).sort().at(-1);
    return moved ?? (phase === "proposed" ? p.createdAt : null);
  };
  const now = PHASES.indexOf(p.phase);
  return PHASES.map((phase, i) => ({
    phase,
    state: i < now ? "done" : i === now ? (p.withdrawn ? "withdrawn" : p.phase === "released" ? "done" : "current") : "todo",
    at: i <= now ? at(phase) : null,
  }));
}

/**
 * AC-49: approved hours against the estimate; hours past it are their own part, never folded into the bar's 100%.
 * 104 AC-9: `waiting` is the hours on live entries in weeks not yet approved, a line of its own, absent at 0; the band
 * and its sentence keep counting approved hours only.
 */
export function timeBand(hours: number, estimate: number | null, waiting = 0) {
  const h = (n: number) => `${Number(n.toFixed(2))} h`;
  const waitingLine = waiting > 0 ? `${h(waiting)} waiting for approval` : null;
  if (!estimate) return { hours, estimate: null, within: hours, over: 0, left: 0, figure: h(hours), rest: "approved · no estimate", sentence: `${h(hours)} approved, no estimate`, waitingLine };
  const within = Math.min(hours, estimate);
  const over = Math.max(0, hours - estimate);
  const left = Math.max(0, estimate - hours);
  const sentence = over ? `${h(hours)} approved of ${h(estimate)} estimated, ${h(over)} over` : `${h(hours)} approved of ${h(estimate)} estimated, ${h(left)} left`;
  return { hours, estimate, within, over, left, figure: h(hours), rest: `of ${h(estimate)} estimated`, sentence, waitingLine };
}

type Stage = { environment: string; environmentId?: string; deploymentId?: string | null; position: number; isProd: boolean; status: string | null; at: string | null };
export type ReleaseLike = { id: string; version: string; proposals: number; stages: Stage[] };
const STATE: Record<string, string> = { deployed: "deployed", testing: "testing", "rolled-back": "rolled back" };

/**
 * AC-42 (as revised 2026-11-04): the release the sprint is heading for, stage by stage, since the board's lanes already
 * count proposals per phase. It's the one the project names as next, else the newest one not yet live in Prod; none
 * when every release is live.
 */
export function releaseBand(releases: ReleaseLike[], next: string | null, health: string) {
  const live = (r: ReleaseLike) => r.stages.some((s) => s.isProd && s.status === "deployed");
  const named = next?.match(/v\d+(\.\d+)+/)?.[0];
  const r = releases.find((x) => x.version === named && !live(x)) ?? releases.find((x) => !live(x));
  if (!r) return null;
  const stages = [...r.stages].sort((a, b) => a.position - b.position).map((s) => ({ ...s, state: s.status ?? "todo" }));
  const sentence = `${r.version}, ${r.proposals} ${r.proposals === 1 ? "proposal" : "proposals"}: ${stages.map((s) => `${s.environment} ${STATE[s.status ?? ""] ?? "not yet"}`).join(", ")}`;
  return { release: r, stages, health: health === "on-track" ? "On track" : "At risk", sentence };
}
