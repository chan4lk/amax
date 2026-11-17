import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { forecastIn } from "./forecast";
import { gridIn } from "./grid";

export type MonthOutlook = {
  month: string;
  capacity: number;
  demand: number;
  over: { personId: string; name: string; percent: number }[];
  bench: { personId: string; skill: string }[];
};

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;

export async function monthOutlook(tx: Tx, v: Viewer, months: string[], today: Date): Promise<MonthOutlook[]> {
  const { teams } = await forecastIn(tx, v, "", months, today);
  const forecasts = await Promise.all(teams.map((team) => forecastIn(tx, v, team, months, today)));
  const grid = await gridIn(tx, v, months, today, true);
  return months.map((month, i) => ({
    month,
    capacity: sum(forecasts.map((f) => f.months[i].capacity)),
    demand: sum(forecasts.map((f) => f.months[i].demand)),
    over: grid.people.filter((p) => p.totals[i] > p.capacity[i]).map((p) => ({ personId: p.personId, name: p.name, percent: p.totals[i] })),
    bench: forecasts.flatMap((f) => f.months[i].bench),
  }));
}
