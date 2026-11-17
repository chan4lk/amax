import type { Viewer } from "@amax/auth";
import { knownBench } from "./server/bench";
import { forecastFor } from "./server/forecast";
import { gridFor } from "./server/grid";

export async function context(v: Viewer) {
  const [forecast, mine, all] = await Promise.all([forecastFor(v), gridFor(v, { everyone: false }), gridFor(v, { everyone: true })]);
  return { forecast, mine, all, known: await knownBench(v, forecast.months) };
}

export const changeIn = (grid: { people: { lines: { projectKey: string | null; label: string }[] }[] }) => {
  const names = new Map(grid.people.flatMap((p) => p.lines.filter((l) => l.projectKey).map((l) => [l.projectKey!, l.label] as const)));
  return (p: Record<string, unknown>) => `${names.get(String(p.projectKey)) ?? p.projectKey} to ${p.percent}%`;
};
