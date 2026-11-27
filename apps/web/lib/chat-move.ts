// Client-safe: no server imports, so the chat panel can use it.
import { inApp } from "./in-app";

/** A write that renames the record a page is named by (a re-tag) returns where that page went (057). */
export type Moved = { from: string; to: string };

const local = (x: unknown): x is string => typeof x === "string" && inApp(x);

/** The `moved` of a tool result, only when both ends are same-site paths. */
export function movedOf(result: unknown): Moved | undefined {
  const m = (result as { moved?: { from?: unknown; to?: unknown } } | null)?.moved;
  return m && local(m.from) && local(m.to) ? { from: m.from, to: m.to } : undefined;
}

/** Where the page should go after a confirmed write: the record's new page, if this page was its old one. */
export function followMove(pathname: string, moved: Moved | undefined): string | null {
  if (!moved) return null;
  const same = (a: string, b: string) => { try { return decodeURIComponent(a) === decodeURIComponent(b); } catch { return a === b; } };
  return same(pathname, moved.from) ? moved.to : null;
}

