type Line = { label: string; percents: (number | null)[] };
type Grid = { months: { month: string }[]; people: { personId: string; lines: Line[] }[] };

export function withUnplanned(detail: string, names: string[]): string {
  if (!names.length) return detail;
  const tail = ", above 100% capacity.";
  const said = `${names.join(", ")} not planned`;
  return detail.endsWith(tail) ? `${detail.slice(0, -tail.length)}, ${said}${tail}` : `${detail} ${said}.`;
}

export const NO_PLAN_NOTE = " The plan couldn't be read for this person and month, so the projects with nothing planned are not listed.";

export function planNote(grid: Grid | null, personId?: string, month?: string): { unplanned: string[]; note: string } {
  const i = grid && month ? grid.months.findIndex((m) => m.month.slice(0, 7) === month.slice(0, 7)) : -1;
  const p = grid && personId ? grid.people.find((x) => x.personId === personId) : undefined;
  if (!grid || !p || i < 0) return { unplanned: [], note: NO_PLAN_NOTE };
  return { unplanned: p.lines.filter((l) => !l.percents[i]).map((l) => l.label), note: "" };
}
