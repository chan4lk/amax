import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { listPeople } from "@amax/hr/contracts";
import { leaveSeen } from "./leave-view";
import { entityZone } from "@amax/workflows";
import { entitiesOf } from "./chain";
import { targetsOf } from "./targets";

const installed = async (tx: Tx, table: string) => Boolean((await tx.execute(sql`select to_regclass(${table}) is not null as on`))[0]?.on);
const todayIn = (zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * 073 amendment 1: what the grid needs to know about everyone on it, read once for all of them (AC-23): targets
 * (072), each person's local today (one zone lookup per legal entity), approved leave in the week, and HR departments
 * for the team filter (D7; null when HR isn't installed). Leave and departments are read as the viewer (073 final
 * review): a person whose leave they may not see has no "On leave" cells, only hours, and `leaveHidden` says so.
 */
export async function gridContext(tx: Tx, v: Viewer, userIds: string[], days: string[]) {
  const targets = await targetsOf(tx, userIds);
  const entities = await entitiesOf(tx, userIds);
  const zones = new Map<string | null, string>();
  for (const e of new Set(entities.values())) zones.set(e, todayIn(await entityZone(tx, e)));
  const today = new Map(userIds.map((id) => [id, zones.get(entities.get(id) ?? null) ?? todayIn("UTC")]));
  const leave = await leaveSeen(tx, v, v.tenantId, { from: days[0], to: days[days.length - 1] }, userIds);
  const onLeave = leave.on;
  const hr = await installed(tx, "hr.person");
  const people = hr ? (await listPeople(tx, v, {})).filter((p) => p.userId && userIds.includes(p.userId)) : [];
  const departments = new Map(people.map((p) => [p.userId as string, p.department]));
  const teams = hr ? [...new Set(people.flatMap((p) => (p.department ? [p.department] : [])))].sort() : null;
  return { targets, today, onLeave, leaveHidden: leave.hidden, departments, teams };
}
