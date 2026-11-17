import type { Known } from "../server/attention";
import type { Forecast } from "../server/forecast";
import { monthLabel } from "../server/months";

export type BenchPerson = Known & { id: string; skill: string };
export type BenchMonth = { month: string; label: string; short: string; count: number; skills: [string, number][]; people: BenchPerson[]; hidden: number };

export function benchMonths(f: Forecast, known: Map<string, Known>): BenchMonth[] {
  return f.months.map((m) => {
    const counts = m.bench.reduce<Record<string, number>>((n, b) => ({ ...n, [b.skill]: (n[b.skill] ?? 0) + 1 }), {});
    const people = m.bench.flatMap((b) => {
      const who = known.get(b.personId);
      return who ? [{ ...who, id: b.personId, skill: b.skill }] : [];
    });
    return {
      month: m.month, label: monthLabel(m.month, "long"), short: monthLabel(m.month), count: m.bench.length,
      skills: Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      people, hidden: m.bench.length - people.length,
    };
  });
}
