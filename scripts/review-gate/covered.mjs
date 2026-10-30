import { NOT_RAN, finalRound, judgeEvidence, reviewScope, verifySection } from "./evidence.mjs";

const OWNER = /^(?:specclaw\((\d{3}-[\w-]+)\)|\[specclaw\] (\d{3}-[\w-]+))/;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const names = (text, name) => new RegExp(`(^|[^\\w-])${escape(name)}([^\\w-]|$)`).test(text);

function coverProblem(change, by, cover) {
  if (!by) return "covered-by names no change";
  if (by === change.name) return "a change can't cover itself";
  if (change.rounds.some((r) => !NOT_RAN.has(r.status))) return `${change.name} has review rounds of its own; judge those, drop covered-by`;
  if (!cover) return "no such change at the PR head";
  if (reviewScope(cover.changeMd).scope === "covered-by") return `${by} is itself covered-by, no chains`;
  if (!names(verifySection(cover.changeMd), change.name)) return `${by}'s ## Verify doesn't name ${change.name}`;
  return null;
}

function excused(commit, change, by, owners, repo) {
  if (commit.recordsOnly || commit.merge) return true;
  const match = OWNER.exec(commit.subject);
  const owner = match?.[1] ?? match?.[2];
  if (owner === by) return true;
  const ownerHead = owner && owner !== change.name ? owners.get(owner) : null;
  return Boolean(ownerHead) && repo.isAncestor(commit.sha, ownerHead);
}

function loopProblem(change, by, head, repo, owners) {
  if (repo.inBase(head)) return `${by}'s final pass is already in the PR's base, so it ran before this PR`;
  if (!repo.history(change.name).some((sha) => repo.isAncestor(sha, head))) return `${by}'s final pass ran before any ${change.name} commit`;
  const stray = repo.after(head).find((c) => !excused(c, change, by, owners, repo));
  return stray ? `${stray.sha.slice(0, 7)} came after ${by}'s final pass and no other loop in the PR reviewed it` : null;
}

export function judgeCovered(change, by, load, repo, owners) {
  const fail = (reason) => ({ verdict: "fail", reason: `covered by ${by ?? "(none)"}: ${reason}` });
  const cover = by && by !== change.name ? load(by) : null;
  const problem = coverProblem(change, by, cover);
  if (problem) return fail(problem);
  const result = judgeEvidence({ ...cover, scope: reviewScope(cover.changeMd).scope, isAncestor: repo.isAncestor });
  if (result.verdict === "fail") return fail(result.reason);
  const late = loopProblem(change, by, finalRound(cover.rounds).head, repo, owners);
  return late ? fail(late) : { verdict: "pass", reason: `covered by ${by}: ${result.reason}` };
}
