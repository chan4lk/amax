import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { contextFor } from "@amax/core/server";
import { listPeople } from "@amax/hr/contracts";
import { approvedLeave, type ApprovedLeave } from "@amax/leave/contracts";
import { entityZone } from "@amax/workflows";
import { entitiesOf } from "./chain";
import { targetsOf } from "./targets";

const installed = async (tx: Tx, table: string) => Boolean((await tx.execute(sql`select to_regclass(${table}) is not null as on`))[0]?.on);
const todayIn = (zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * 073 amendment 1: what the grid needs to know about everyone on it, read once for all of them (AC-23): targets
 * (072), each person's local today (one zone lookup per legal entity), approved leave in the week, and HR departments
 * for the team filter (D7; null when HR isn't installed).
 */
export async function gridContext(tx: Tx, tenantId: string, userIds: string[], days: string[]) {
  const job = contextFor.job(tenantId, "time.grid");
  const targets = await targetsOf(tx, userIds);
  const entities = await entitiesOf(tx, userIds);
  const zones = new Map<string | null, string>();
  for (const e of new Set(entities.values())) zones.set(e, todayIn(await entityZone(tx, e)));
  const today = new Map(userIds.map((id) => [id, zones.get(entities.get(id) ?? null) ?? todayIn("UTC")]));
  const leave: ApprovedLeave[] = (await installed(tx, "leave.request")) ? await approvedLeave(tx, job, { from: days[0], to: days[days.length - 1] }) : [];
  const onLeave = (userId: string, day: string) => leave.some((l) => l.userId === userId && l.startsOn <= day && l.endsOn >= day);
  const hr = await installed(tx, "hr.person");
  const people = hr ? (await listPeople(tx, job, {})).filter((p) => p.userId && userIds.includes(p.userId)) : [];
  const departments = new Map(people.map((p) => [p.userId as string, p.department]));
  const teams = hr ? [...new Set(people.flatMap((p) => (p.department ? [p.department] : [])))].sort() : null;
  return { targets, today, onLeave, departments, teams };
}
