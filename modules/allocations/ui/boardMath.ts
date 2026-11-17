import type { GridLine, GridPerson } from "../server/grid";

export const pct = (index: number, count: number) => `${(index * 100) / count}%`;

export function runsOf(line: GridLine) {
  const runs: { from: number; to: number }[] = [];
  line.percents.forEach((p, i) => {
    if (!p) return;
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1) last.to = i;
    else runs.push({ from: i, to: i });
  });
  return runs;
}

export function benchRuns(person: GridPerson) {
  const runs: { from: number; to: number }[] = [];
  const idle = (i: number) => person.totals[i] === 0 && person.capacity[i] > 0;
  for (let i = 0; i < person.totals.length; i++) {
    if (!idle(i)) continue;
    let j = i;
    while (j + 1 < person.totals.length && idle(j + 1)) j++;
    runs.push({ from: i, to: j });
    i = j;
  }
  return runs;
}
