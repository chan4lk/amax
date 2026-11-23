import type { PersonUtilisation } from "../contracts";
import { monthName, rangeOf, shiftMonth } from "./days";
import { personFigures } from "./figures";
import type { Inputs } from "./inputs";

export type HeatRow = { userId: string; name: string; initials: string; cells: (number | null)[] };
export type Heat = { months: { month: string; label: string }[]; rows: HeatRow[] };

const SPAN = 6;

export function heatOf(inputs: Inputs, rows: PersonUtilisation[], month: string, today: string): Heat {
  const months = Array.from({ length: SPAN }, (_, i) => shiftMonth(month, i - SPAN + 1));
  const people = rows.filter((r) => !r.noTime);
  return {
    months: months.map((m) => ({ month: m, label: monthName(m, "short") })),
    rows: people.flatMap((r) => {
      const p = inputs.people.find((x) => x.userId === r.userId);
      if (!p) return [];
      const cells = months.map((m) => {
        const range = rangeOf(m, today);
        const logged = range && (inputs.hours.get(p.userId) ?? []).some((h) => h.day >= range.from && h.day <= range.to);
        return range && logged ? personFigures(p, inputs, range).utilisation : null;
      });
      return [{ userId: r.userId, name: r.name, initials: r.initials, cells }];
    }),
  };
}
