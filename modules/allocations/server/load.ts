import { sql } from "drizzle-orm";
import type { Tx } from "@amax/db";
import { monthLabel } from "./months";

export const monthWords = (month: string) => `${monthLabel(month, "long")} ${month.slice(0, 4)}`;

export async function loadOf(tx: Tx, personId: string, months: string[]) {
  const rows = await tx.execute(sql`select month::text as month, sum(percent)::int as total from allocations.allocation
    where person_id = ${personId} and month between ${months[0]}::date and ${months[months.length - 1]}::date group by month`);
  const total = (m: string) => Number(rows.find((r) => r.month === m)?.total ?? 0);
  const top = [...months].sort((a, b) => total(b) - total(a) || a.localeCompare(b))[0];
  return { month: monthWords(top), total: total(top), settled: months.filter((m) => total(m) <= 100).map(monthWords) };
}
