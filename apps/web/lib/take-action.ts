type Line = { label: string; percents: (number | null)[] };
type Grid = { months: { month: string }[]; people: { personId: string; lines: Line[] }[] };

export function notPlanned(grid: Grid, personId: string, month: string): string[] {
  const i = grid.months.findIndex((m) => m.month.slice(0, 7) === month.slice(0, 7));
  const p = grid.people.find((x) => x.personId === personId);
  return p && i >= 0 ? p.lines.filter((l) => !l.percents[i]).map((l) => l.label) : [];
}

export function withUnplanned(detail: string, names: string[]): string {
  if (!names.length) return detail;
  const tail = ", above 100% capacity.";
  const said = `${names.join(", ")} not planned`;
  return detail.endsWith(tail) ? `${detail.slice(0, -tail.length)}, ${said}${tail}` : `${detail} ${said}.`;
}
