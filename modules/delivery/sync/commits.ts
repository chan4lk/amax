// 104 AC-2: the commits named for a change, read from git by the plugin, CI and the self-sync (the server never runs
// git). Build-time tooling, like authors.ts: only each commit's id, author email and time leave this file, and amax
// resolves the email to a person at sync time without storing it.
import { execFileSync } from "node:child_process";

export type ChangeCommit = { id: string; email: string; at: string };

const SUBJECT = /^(?:specclaw\((\d{3,}-[a-z0-9][a-z0-9-]*)\)|\[specclaw\] (\d{3,}-[a-z0-9][a-z0-9-]*)\b)/;

/** The change a commit's subject names (`specclaw(<NNN-slug>)` or `[specclaw] <NNN-slug>`), or null. */
export const changeOf = (subject: string) => {
  const m = SUBJECT.exec(subject);
  return m ? (m[1] ?? m[2]) : null;
};

const MARK = /specclaw\(\d{3,}-|\[specclaw\] \d{3,}-/g;
const LISTED = /^\s*(?:[*-]\s*)?(?:specclaw\(\d{3,}-|\[specclaw\] \d{3,}-)/gm;

/**
 * Review rounds 1 and 2: a commit that folds others isn't work of its own: its author time is the merge, and the work's
 * own commits were read on their branch. Told by its shape, not by any mention: a pull request number on the subject
 * (GitHub's squash and merge, "… (#120)"), a body that lists change subjects at the start of lines (GitHub's default
 * squash body), or a subject that joins several. A body that only mentions another change is an ordinary commit.
 */
export const foldsCommits = (message: string) => {
  const [subject, ...body] = message.split("\n");
  return /\(#\d+\)\s*$/.test(subject) || (subject.match(MARK) ?? []).length > 1 || (body.join("\n").match(LISTED) ?? []).length > 0;
};

const MAX = 20_000;
const SEP = "\u001e";

/**
 * Every change's commits reachable from `at`, by change folder, newest first: merges and squashes left out. One git walk
 * for the whole repo (review round 1: one per change was a git process per folder), pre-filtered by git on the subject's
 * start and checked again here, so a body line that mentions a change doesn't count. `undefined` when git couldn't be
 * read, so the payload says the read wasn't made rather than "no commits".
 */
export function commitsByChange(root: string, at: string): Map<string, ChangeCommit[]> | undefined {
  let out: string;
  try {
    out = execFileSync("git", ["log", at, "--no-merges", `-${MAX}`, "-E", "--grep=^(specclaw\\(|\\[specclaw\\] )", `--format=%H%x09%ae%x09%aI%x09%B${SEP}`],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return undefined;
  }
  const by = new Map<string, ChangeCommit[]>();
  for (const c of out.split(SEP).map((x) => x.replace(/^\s+/, "")).filter(Boolean)) {
    const [id, email, when, ...rest] = c.split("\t");
    const message = rest.join("\t");
    const dir = changeOf(message.split("\n")[0]);
    if (!dir || foldsCommits(message)) continue;
    by.set(dir, [...(by.get(dir) ?? []), { id, email, at: new Date(when).toISOString() }]);
  }
  return by;
}

/** One change's commits from `at` (see commitsByChange); `undefined` when git couldn't be read. */
export const commitsOf = (root: string, at: string, dir: string) => {
  const all = commitsByChange(root, at);
  return all ? (all.get(dir) ?? []) : undefined;
};
