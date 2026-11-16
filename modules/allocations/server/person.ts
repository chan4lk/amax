import type { Tx } from "@amax/db";
import { getPerson, listPeople, type PersonRef, type Reader } from "@amax/hr/contracts";

export type Resolved = { kind: "found"; person: PersonRef } | { kind: "ambiguous" } | { kind: "none" };

/** The refusal for a name two people share, the same on the card and in the service. */
export const ambiguous = (who: string) => `${who.trim()} matches more than one person; use the employee number`;

/** Who `allocate` means: an employee number or id, else the one active or joining person with that full name. */
export async function resolvePerson(tx: Tx, reader: Reader, who: string): Promise<Resolved> {
  const exact = await getPerson(tx, reader, who);
  if (exact) return { kind: "found", person: exact };
  const named = (await listPeople(tx, reader, { status: ["active", "joining"] })).filter((p) => p.name.toLowerCase() === who.trim().toLowerCase());
  if (named.length > 1) return { kind: "ambiguous" };
  return named.length ? { kind: "found", person: named[0] } : { kind: "none" };
}
