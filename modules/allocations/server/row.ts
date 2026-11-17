import type { Viewer } from "@amax/auth";
import { gridFor } from "./grid";

export type RowRef = { person: string; projectId?: string; work?: string };

export async function getAllocation(v: Viewer, ref: RowRef, today?: Date) {
  const grid = await gridFor(v, { everyone: true, today });
  // An employee number is unique; a name may not be. Never answer with whichever namesake comes first (057).
  const byNo = grid.people.filter((x) => x.employeeNo === ref.person);
  const matches = byNo.length ? byNo : grid.people.filter((x) => x.name.toLowerCase() === ref.person.trim().toLowerCase());
  if (matches.length > 1) throw new Error(`more than one ${ref.person} is in the grid (${matches.map((x) => x.employeeNo).join(", ")}); use their employee number`);
  // Not found and outside your hr access read the same on purpose: a read must not tell you a hidden person exists.
  const [p] = matches;
  if (!p) return null;
  const months = grid.months.map((m) => m.month);
  if (!ref.projectId && !ref.work) return { person: p.name, employeeNo: p.employeeNo, months, totals: p.totals, capacity: p.capacity };
  const line = p.lines.find((l) => (ref.projectId ? l.projectId === ref.projectId : !l.projectId && l.label === ref.work));
  return line ? { person: p.name, employeeNo: p.employeeNo, months, project: line.label, manages: line.manages, editable: line.editable, percents: line.percents, capacity: p.capacity } : null;
}
