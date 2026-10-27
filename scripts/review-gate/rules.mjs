const CHANGE_DIR = /^\.specclaw\/changes\/(?:archive\/)?(\d{3}-[^/]+)\//;
const UNCOUNTED = new Set(["not_run"]);
const NOT_RAN = new Set(["not_run", "skipped"]);
export const MAX_PASSES = 5;

export function reviewScope(changeMd) {
  const match = /\*\*Review:\*\*\s*`?(change|module-end)`?/.exec(changeMd ?? "");
  return match ? match[1] : "change";
}

export function touchedChangeDirs(files) {
  const dirs = new Map();
  for (const file of files) {
    const match = CHANGE_DIR.exec(file);
    if (match) dirs.set(match[1], file.slice(0, file.indexOf(match[1]) + match[1].length));
  }
  return dirs;
}

export function needsProposal(files) {
  return files.some((file) => !file.startsWith(".specclaw/"));
}

function verifySection(changeMd) {
  const at = (changeMd ?? "").indexOf("## Verify");
  return at < 0 ? "" : changeMd.slice(at);
}

export function judgeEvidence({ rounds, scope, changeMd, isAncestor }) {
  const counted = rounds.filter((r) => !UNCOUNTED.has(r.status));
  const finals = rounds.filter((r) => r.final && !NOT_RAN.has(r.status)).sort((a, b) => a.round - b.round);
  const last = finals.at(-1);
  if (!last) return { verdict: "fail", reason: `no final review round (review/ has ${rounds.length} rounds)` };
  if (counted.length > MAX_PASSES) return { verdict: "fail", reason: `${counted.length} passes, cap is ${MAX_PASSES}` };
  const blockers = last.counts?.blocker ?? 0;
  const stop = verifySection(changeMd);
  if (blockers > 0 && !(/stop/i.test(stop) && /blocker/i.test(stop))) {
    return { verdict: "fail", reason: `${blockers} open blocker(s) and no stop recorded under ## Verify` };
  }
  if (!last.head || !isAncestor(last.head)) return { verdict: "fail", reason: `reviewed head ${last.head ?? "missing"} is not in this PR` };
  if (scope === "module-end" && !counted.some((r) => r.since)) {
    return { verdict: "fail", reason: "module-end review has no round run with --since" };
  }
  return { verdict: "pass", reason: `final round ${counted.length}/${MAX_PASSES} ${last.status}, ${blockers} blockers, head ${last.head.slice(0, 7)} in PR` };
}

export function gate({ fork, files, changes, isAncestor }) {
  const lines = [fork ? "fork PR: review evidence required" : "same-repo PR: module cadence"];
  let ok = true;
  for (const change of changes) {
    const scope = reviewScope(change.changeMd);
    const result = fork || scope === "module-end"
      ? judgeEvidence({ ...change, scope, isAncestor })
      : { verdict: "skip", reason: "single change, review runs at module end" };
    if (result.verdict === "fail") ok = false;
    lines.push(`${change.name.padEnd(28)} scope=${scope.padEnd(10)} ${result.verdict} — ${result.reason}`);
  }
  if (fork && changes.length === 0 && needsProposal(files)) {
    ok = false;
    lines.push(`${"(no change dir)".padEnd(28)} ${"".padEnd(16)} fail — code changed with no specclaw change: propose first`);
  }
  return { ok, lines };
}
