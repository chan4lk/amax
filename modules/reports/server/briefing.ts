import { monthName } from "./days";
import { articleFor } from "./lede";
import type { Pulse } from "./pulse-types";

type Parts = Pick<Pulse, "monthName" | "target" | "utilisation" | "capacity" | "allocation" | "hours">;

const names = (list: string[]) => (list.length <= 3 ? list.join(", ").replace(/, ([^,]*)$/, " and $1") : `${list.slice(0, 2).join(", ")} and ${list.length - 2} more`);

function opening(p: Parts) {
  if (p.utilisation === null) return `${p.monthName} has no logged hours you can see yet.`;
  return p.utilisation >= p.target
    ? `${p.monthName} is on track: utilisation is ${p.utilisation}% against ${articleFor(p.target)} ${p.target}% target.`
    : `${p.monthName} is behind: utilisation is ${p.utilisation}%, below the ${p.target}% target.`;
}

function watch(p: Parts) {
  const tight = p.capacity.months.find((m) => m.over > 0);
  const stretched = p.allocation.months.find((m) => m.over.length > 0);
  const slipping = p.hours.rows.filter((r) => r.flag).sort((a, b) => Math.abs(b.drift ?? 0) - Math.abs(a.drift ?? 0)).slice(0, 2);
  return [
    tight && `${monthName(tight.month.slice(0, 7))} has demand ${tight.over} FTE over capacity`,
    stretched && `${names(stretched.over.map((o) => o.name))} ${stretched.over.length === 1 ? "is" : "are"} over-allocated in ${stretched.label}`,
    ...slipping.map((r) => `${r.name} has logged ${Math.abs(r.drift ?? 0)}% ${r.flag === "behind" ? "behind" : "over"} its plan`),
  ].filter((c): c is string => Boolean(c));
}

export function briefingOf(p: Parts) {
  const clauses = watch(p);
  const second = clauses.length ? `${clauses.join("; ")}.`.replace(/^./, (c) => c.toUpperCase()) : "Nothing needs attention.";
  return `${opening(p)} ${second}`;
}
