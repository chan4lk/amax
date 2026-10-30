import { judgeCovered } from "./covered.mjs";
import { finalRound, judgeEvidence, reviewScope } from "./evidence.mjs";

const CHANGE_DIR = /^\.specclaw\/changes\/(?:archive\/)?(\d{3}-[^/]+)\//;

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

function judge(change, { fork, load, repo, owners }) {
  const { scope, by } = reviewScope(change.changeMd);
  if (fork && scope === "covered-by") return { scope, ...judgeCovered(change, by, load, repo, owners) };
  if (fork || scope === "module-end") return { scope, ...judgeEvidence({ ...change, scope, isAncestor: repo.isAncestor }) };
  return { scope, verdict: "skip", reason: "single change, review runs at module end" };
}

export function gate({ fork, files, changes, load, repo }) {
  const lines = [fork ? "fork PR: review evidence required" : "same-repo PR: module cadence"];
  let ok = true;
  const owners = new Map(changes.filter((c) => reviewScope(c.changeMd).scope !== "covered-by" && finalRound(c.rounds)?.head)
    .map((c) => [c.name, finalRound(c.rounds).head]));
  for (const change of changes) {
    const { scope, ...result } = judge(change, { fork, load, repo, owners });
    if (result.verdict === "fail") ok = false;
    lines.push(`${change.name.padEnd(28)} scope=${scope.padEnd(10)} ${result.verdict} — ${result.reason}`);
  }
  if (fork && changes.length === 0 && needsProposal(files)) {
    ok = false;
    lines.push(`${"(no change dir)".padEnd(28)} ${"".padEnd(16)} fail — code changed with no specclaw change: propose first`);
  }
  return { ok, lines };
}
