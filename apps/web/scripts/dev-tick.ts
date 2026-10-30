import { notLocal } from "./dev-seed";

// 074 amendment 1: in local dev the jobs tick runs on its own, as production's worker does, so bells, email, Finance
// and Reports update without anyone posting to /api/jobs/tick. Same guard as the demo seed; AMAX_DEV_TICK=0 turns it off.
type Env = Record<string, string | undefined>;
export type TickPlan = { url: string; secret: string; intervalMs: number } | { off: string };

export function tickPlan(env: Env): TickPlan {
  if (env.AMAX_DEV_TICK === "0") return { off: "AMAX_DEV_TICK=0" };
  const why = notLocal(env.DATABASE_URL);
  if (why) return { off: why };
  if (!env.CRON_SECRET) return { off: "no CRON_SECRET" };
  return { url: `http://localhost:${env.PORT ?? 3000}/api/jobs/tick`, secret: env.CRON_SECRET, intervalMs: Number(env.AMAX_TICK_SECONDS ?? 10) * 1000 };
}

const COUNTS = [["events", "event", ""], ["eventsFailed", "event", " failed"], ["jobs", "job", ""], ["jobsFailed", "job", " failed"]] as const;

/**
 * The worker's log, kept quiet: a line only when a tick delivered something or failed. Failures before the first good
 * tick are Next still starting, so they are dropped.
 */
export function quietLog(print: (line: string) => void = console.log) {
  let ready = false;
  return (line: string) => {
    const ok = /^tick 200 (.*)$/s.exec(line);
    if (!ok) return void (ready && print(`jobs tick: ${line}`));
    ready = true;
    let r: Record<string, unknown>;
    try { r = JSON.parse(ok[1]); } catch { return; }
    const done = COUNTS.filter(([k]) => Number(r[k]) > 0).map(([k, noun, what]) => `${Number(r[k])} ${noun}${Number(r[k]) === 1 ? "" : "s"}${what}`);
    if (done.length) print(`jobs tick: ${done.join(", ")}`);
  };
}
