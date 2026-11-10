// 089 AC-9: change numbers that two folders share. Neither folder can own the proposal key, so every sync skips them
// with this line and leaves the stored proposal as it is. Found from the records themselves, whatever a client flags.
export function duplicateNumbers(records: { number: string; dir: string; duplicate?: boolean }[]) {
  const dirs = new Map<string, Set<string>>();
  for (const r of records) dirs.set(r.number, (dirs.get(r.number) ?? new Set()).add(r.dir));
  const flagged = new Set(records.filter((r) => r.duplicate).map((r) => r.number));
  return new Map([...dirs].filter(([n, d]) => d.size > 1 || flagged.has(n)).map(([n, d]) => [n, `two changes numbered ${n}: ${[...d].sort().join(", ")}`]));
}

type Readable = { number: string; dir: string; duplicate?: boolean; unreadable: boolean; source: string };

/** 090, 093 review: why a sync skips a record (a shared number, an unreadable state.json), or null when it may write it. */
export function skipReason(r: Readable, dupes: Map<string, string>): { code: "duplicate" | "unreadable"; text: string } | null {
  const dupe = dupes.get(r.number);
  if (dupe) return { code: "duplicate", text: dupe };
  return r.unreadable ? { code: "unreadable", text: `state.json unreadable at ${r.source}` } : null;
}

/** 090: the records the self-sync writes, by its own rule, for anyone (the e2e board check) that must agree with it. */
export const onBoard = <T extends Readable>(records: T[]) => {
  const dupes = duplicateNumbers(records);
  return records.filter((r) => !skipReason(r, dupes));
};
