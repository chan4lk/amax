// 091 AC-7: who added each change's change.md, read from git, so amax can make them its owner. Build-time tooling,
// like specclaw.ts: the plugin, CI and the self-sync run it; the server never does. Only the email leaves this file,
// and amax resolves it to a person at sync time without storing it (the trace keeps a keyed hash of a tool's
// arguments, never the arguments). 094 AC-1, AC-2: the same walk dates the change and its ticked tasks.
import { execFileSync } from "node:child_process";
import { readParts } from "./sha";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).trim();

type TaskLine = { ref: string; done: boolean; doneAt?: string | null };
type Readable = { dir: string; phase: string; source?: string; createdAt?: string | null; tasks?: TaskLine[] };


/** Whether `root` is a shallow clone, so authors can't be read (the CI job checks out with full history). */
export const isShallow = (root: string) => { try { return git(root, "rev-parse", "--is-shallow-repository") === "true"; } catch { return true; } };

/**
 * Each record's author: the email on the commit that first added its change.md at its own commit (the sha in
 * `source`, else `rev`), following the move to archive/. `undefined` when it can't be told: git failed, a shallow
 * clone (whose first commit shows every file as added), or the file isn't in the tree at that commit (a checkout
 * with uncommitted changes). amax then keeps the stored owner. `only` limits it to one folder (a branch's own); the
 * others get `undefined` too.
 *
 * 094 AC-1: a record whose files don't say when it was written (no Created header, no proposal time) is dated by that
 * add commit. 094 AC-2: each ticked task is dated by the commit that ticked it. Neither is read when git can't tell.
 */
export function authorsOf<T extends Readable>(root: string, rev: string, records: T[], only?: string): (T & { author?: string | null })[] {
  const shallow = isShallow(root);
  return records.map((r) => {
    if (shallow || (only && r.dir !== only)) return { ...r, author: undefined };
    // The sha at the end of a record's source ("main@4f2c9a1"), by the one read rule (sync/sha.ts).
    const at = readParts(r.source)?.sha ?? rev;
    const path = `.specclaw/changes/${r.phase === "released" ? "archive/" : ""}${r.dir}/change.md`;
    try {
      git(root, "cat-file", "-e", `${at}:${path}`);
      const lines = git(root, "log", at, "--follow", "--diff-filter=A", "--format=%ae%x09%aI", "--", path).split("\n").filter(Boolean);
      // 092 AC-3: the file is in the tree, so a missing add commit means git couldn't tell, not "nobody".
      const [author, addedAt] = lines.length ? lines[lines.length - 1].split("\t") : [undefined, undefined];
      const createdAt = r.createdAt ?? (addedAt ? new Date(addedAt).toISOString() : r.createdAt);
      return { ...r, author, createdAt, ...(r.tasks ? { tasks: tickDates(root, at, path, r.tasks) } : {}) };
    } catch {
      return { ...r, author: undefined };
    }
  });
}

const LINE = /^([+-])- \[( |x)\] `(T\d+)`/;

/**
 * 094 AC-2: each ticked task's date: the newest commit whose diff of change.md both removes the task's open line and adds
 * its ticked one, following the move to archive/. Only that is a tick: a commit that rewords, reorders or rewrites an
 * already-ticked task adds its ticked line without removing an open one, and doesn't count. Newest first, so a task
 * unticked and ticked again dates from its last tick. A task git can't date keeps none, and amax keeps the date it has;
 * a failed walk dates nothing and leaves the author alone (review round 1).
 */
function tickDates<K extends TaskLine>(root: string, at: string, path: string, tasks: K[]): K[] {
  if (!tasks.some((t) => t.done)) return tasks;
  let log: string;
  try { log = git(root, "log", at, "--follow", "--format=@@commit %aI", "-p", "--unified=0", "--", path); } catch { return tasks; }
  const dated = new Map<string, string>();
  // Final pass: the oldest commit that adds a task's line. When it adds it already ticked (a squash merge, a change
  // committed in one go), no commit ever had it open on this history, so that commit is when it was ticked here.
  const first = new Map<string, { when: string; ticked: boolean }>();
  const commits = log.split("\n@@commit ").map((c) => c.replace(/^@@commit /, ""));
  for (const c of commits) {
    const [when, ...lines] = c.split("\n");
    const opened = new Set<string>(), ticked = new Set<string>();
    for (const line of lines) {
      const m = line.match(LINE);
      if (m?.[1] === "-" && m[2] === " ") opened.add(m[3]);
      if (m?.[1] === "+") {
        if (m[2] === "x") ticked.add(m[3]);
        // Newest first, so the last one recorded is the oldest; within a commit, a ticked line wins.
        const f = first.get(m[3]);
        if (!f || f.when !== when) first.set(m[3], { when, ticked: m[2] === "x" });
        else if (m[2] === "x") f.ticked = true;
      }
    }
    for (const ref of ticked) if (opened.has(ref) && !dated.has(ref)) dated.set(ref, new Date(when).toISOString());
  }
  for (const [ref, f] of first) if (!dated.has(ref) && f.ticked) dated.set(ref, new Date(f.when).toISOString());
  return tasks.map((t) => (t.done && dated.has(t.ref) ? { ...t, doneAt: dated.get(t.ref)! } : t));
}

/**
 * 091 AC-7: the email a record names its owner by: the header's Owner line, else its author. `undefined` when the
 * author couldn't be read, so the stored owner stays; `null` when the repo names nobody.
 */
export const ownerEmailOf = (r: { owner?: string | null; author?: string | null }) => (r.owner ? r.owner : r.author);
