import { activeAccount, type Viewer } from "@amax/auth";
import { monthRange, type CardField, type ToolCard } from "@amax/core";
import { ToolError } from "@amax/mcp";
import { getProjectRef } from "@amax/delivery/contracts";
import { listPeople } from "@amax/hr/contracts";
import { ambiguous, resolvePerson } from "./person";
import { listAllocations, monthOf } from "../contracts";
import { monthLabel, windowMonths } from "./months";
import { readAlloc } from "./read";
import { STANDING_WITH_END, standingWithEnd } from "./rules";
import { freeIn } from "./team";

export type AddInput = { person?: string; projectKey?: string; work?: string; month?: string; through?: string; percent?: number; standing?: boolean; overOk?: boolean };
const PICKS = 4;

export const freeLabel = (free: number | null) => (free === null ? "" : free === 0 ? " · fully allocated" : free < 0 ? ` · over-allocated by ${-free}%` : ` · ${free}% free this month`);

async function picks(v: Viewer, projectId: string, month: string) {
  return readAlloc(v, async (tx) => {
    const on = new Set((await listAllocations(tx, v, { from: month, to: month, projectIds: [projectId] })).rows.map((r) => r.personId));
    const people = (await listPeople(tx, v, { status: ["active"] })).filter((p) => !on.has(p.id));
    const free = await freeIn(tx, v, people.map((p) => p.id), month);
    return people.map((p) => ({ p, free: free(p.id) })).sort((a, b) => (b.free ?? -1e9) - (a.free ?? -1e9) || a.p.name.localeCompare(b.p.name)).slice(0, PICKS)
      .map(({ p, free: f }) => ({ value: p.employeeNo, short: p.name, label: `${p.name} · ${p.title}${freeLabel(f)}` }));
  });
}

/** The person as allocate finds them, with the service's own resolver and the viewer's HR scope. */
const personNamed = (v: Viewer, who: string) => readAlloc(v, (tx) => resolvePerson(tx, v, who));

/**
 * 107 AC-8: before the card and while it is edited, the person must be in HR. Someone who can sign in but has no HR
 * record yet is named, with the way on: add them to HR first (HR's own write, then this card again). A name two people
 * share asks for the employee number, as the service would.
 */
export async function proposeAllocate(v: Viewer, a: AddInput) {
  if (standingWithEnd(a)) throw new ToolError(STANDING_WITH_END, "invalid_input", "through");
  if (!a.person) return;
  const r = await personNamed(v, a.person.trim());
  if (r.kind === "found") return;
  if (r.kind === "ambiguous") throw new ToolError(ambiguous(a.person), "invalid_input", "person");
  const account = await readAlloc(v, (tx) => activeAccount(tx, a.person!));
  throw new ToolError(account ? `${account.name} can sign in but has no HR record yet. Add them to HR first: "add ${account.name} to HR for ${a.projectKey ?? "the project"}"`
    : `No one called ${a.person.trim()} is in HR`, "invalid_input", "person");
}

/** 107 AC-7: the Add to project card, a 106 form: likely people, a percent, and This month or Until further notice. */
export async function addCard(v: Viewer, a: AddInput): Promise<ToolCard> {
  const project = a.projectKey ? await readAlloc(v, (tx) => getProjectRef(tx, a.projectKey!)) : null;
  const month = a.month ?? windowMonths(new Date(), 1)[0];
  const found = a.person ? await personNamed(v, a.person.trim()) : null;
  const who = found?.kind === "found" ? found.person.name : a.person ?? "someone";
  if (!project) return { title: `Allocate ${who}${a.work ? ` to ${a.work}` : ""}`, lines: [{ label: "Percent", value: `${a.percent ?? 0}%` }] };
  const internal = project.billing === "internal";
  // 109 AC-3, AC-4: until further notice is offered first only when no month was named; a range keeps its end month.
  const named = Boolean(a.month || a.through);
  const range = a.through ? (monthRange(month, monthOf(a.through)) ?? "") : "";
  const fields: CardField[] = [
    { name: "person", label: "Who", kind: "chips", options: await picks(v, project.id, month), other: "Someone else…", required: true },
    { name: "percent", label: "Percent", kind: "text", value: String(internal ? 100 : 50) },
    ...(a.through ? [{ name: "through", label: "Through", kind: "text", rangeFrom: month } as CardField] : []),
    { name: "standing", label: "For", kind: "chips", value: String(internal && !named), options: [{ value: "false", label: "This month" }, { value: "true", label: "Until further notice" }] },
  ];
  const when = a.standing ? "until further notice" : range ? range : `in ${monthLabel(month, "long")}`;
  // Review round 2: the title and look name no range, which Through can change; the button names it live, and at confirm
  // the card is worded again from the edited input (rewordCard), so `done` names the months and percent written.
  return {
    title: `Add ${who} to ${project.key}`, lines: [],
    look: { kind: "Add to project", confirm: `Add ${who} to ${project.key}`, done: `Added ${who} to ${project.key} · ${a.percent ?? ""}% ${when}` },
    // Review round 1: the button names Through from the field, so an edited end month shows on it at once.
    form: { fields, confirm: { label: `Add {person} to ${project.key}${range ? ", {through}" : ""}` } },
  };
}
