import { sql } from "drizzle-orm";
import { can, type Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { listProjectRefs } from "@amax/delivery/contracts";
import { monthOf } from "../contracts";
import { ctxFor } from "./context";
import { monthWords } from "./load";
import { readAlloc } from "./read";
import { monthsBetween, personOf } from "./services";

type Ask = { person: string; projectKey?: string; work?: string; month: string; through?: string; percent: number; overOk?: boolean };

export async function overLines(v: Viewer, a: Ask) {
  if (a.percent <= 0) return [];
  return readAlloc(v, async (tx) => {
    const person = await personOf(tx, ctxFor(v, "chat"), a.person);
    const projects = await listProjectRefs(tx);
    const said = (a.projectKey ?? a.work ?? "").trim().toLowerCase();
    const project = projects.find((p) => p.key.toLowerCase() === said || p.name.toLowerCase() === said);
    const months = monthsBetween(monthOf(a.month), monthOf(a.through ?? a.month));
    const rows = await tx.execute(sql`select month::text as month, project_id, work, percent from allocations.allocation
      where person_id = ${person.id} and month between ${months[0]}::date and ${months[months.length - 1]}::date`);
    const others = (m: string) => rows.filter((r) => r.month === m && !(project ? r.project_id === project.id : r.work === a.work));
    const name = (r: Record<string, unknown>) => projects.find((p) => p.id === r.project_id)?.name ?? (r.work as string);
    return months.flatMap((m) => {
      const total = others(m).reduce((n, r) => n + Number(r.percent), 0) + a.percent;
      return total > 100 ? [`**${person.name}** would be at ${total}% in ${monthWords(m)} (${[...others(m).map((r) => `${name(r)} ${r.percent}%`), `${project?.name ?? a.work} ${a.percent}%`].join(", ")})`] : [];
    });
  });
}

export async function overCheck(v: Viewer, a: Ask) {
  if (a.overOk) return;
  const over = await overLines(v, a);
  if (over.length) throw new ToolError(`${over.join("; ")}. Tell the user that in one line and ask "Are you sure?". Only if they say yes, call allocate again with the same values and overOk: true`, "invalid_input");
}

export async function overNote(v: Viewer, a: Ask) {
  const over = await overLines(v, a);
  return over.length ? `${over.join("; ").replace(/\*\*/g, "")}. You can still add them.` : undefined;
}

type Slot = { person: string; projectKey?: string; work?: string; month: string; through?: string };

export async function scopeCheck(v: Viewer, a: Slot, clearsOthers = false) {
  const refused = await readAlloc(v, async (tx) => {
    const projects = await listProjectRefs(tx);
    const find = (said: string) => projects.find((p) => p.key.toLowerCase() === said.trim().toLowerCase() || p.name.toLowerCase() === said.trim().toLowerCase());
    const target = find(a.projectKey ?? a.work ?? "");
    const slots: { name: string; projectId: string | null; manager: string | null }[] = [{ name: target?.name ?? a.work ?? "", projectId: target?.id ?? null, manager: target?.managerUserId ?? null }];
    if (clearsOthers) {
      const person = await personOf(tx, ctxFor(v, "chat"), a.person);
      const months = monthsBetween(monthOf(a.month), monthOf(a.through ?? a.month));
      const rows = await tx.execute(sql`select distinct project_id, work from allocations.allocation where person_id = ${person.id} and month between ${months[0]}::date and ${months[months.length - 1]}::date`);
      for (const r of rows) {
        const p = projects.find((x) => x.id === r.project_id);
        if (p ? p.id !== target?.id : (r.work as string) !== a.work) slots.push({ name: p?.name ?? (r.work as string), projectId: p?.id ?? null, manager: p?.managerUserId ?? null });
      }
    }
    const no = slots.filter((s) => !can(v, "allocations:allocate", s.projectId ? { projectId: s.projectId } : {}));
    return Promise.all(no.map(async (s) => {
      const [m] = s.manager ? await tx.execute(sql`select name from auth.user where id = ${s.manager}`) : [];
      return s.projectId ? `${s.name} is managed by ${(m?.name as string | undefined) ?? "another manager"} (or an admin can change it), not you` : `${s.name} isn't one of your projects, only an admin can change it`;
    }));
  });
  if (refused.length) throw new ToolError(`You can't change this: ${refused.join("; ")}. Tell the user that plainly in one line, before anything else, make no card, then give the person's current record (every project with its percent, the total) as information only`, "forbidden");
}

export async function proposeAllocate(v: Viewer, a: Ask) {
  await scopeCheck(v, a);
  await overCheck(v, a);
}
