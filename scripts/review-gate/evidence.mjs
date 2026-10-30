const UNCOUNTED = new Set(["not_run"]);
export const NOT_RAN = new Set(["not_run", "skipped"]);
export const MAX_PASSES = 5;

export function reviewScope(changeMd) {
  const header = (changeMd ?? "").split(/^## /m)[0];
  const match = /\*\*Review:\*\*[ \t]*`?(change|module-end|covered-by)`?(?:[ \t]+`?(\d{3}-[\w-]+)`?)?/.exec(header);
  return match ? { scope: match[1], by: match[1] === "covered-by" ? match[2] ?? null : null } : { scope: "change", by: null };
}

export function verifySection(changeMd) {
  const at = (changeMd ?? "").search(/^## Verify[ \t]*$/m);
  return at < 0 ? "" : changeMd.slice(at).split(/^## (?!Verify[ \t]*$)/m)[0];
}

export function finalRound(rounds) {
  return rounds.filter((r) => r.final && !NOT_RAN.has(r.status)).sort((a, b) => a.round - b.round).at(-1);
}

export function judgeEvidence({ rounds, scope, changeMd, isAncestor }) {
  const counted = rounds.filter((r) => !UNCOUNTED.has(r.status));
  const last = finalRound(rounds);
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
