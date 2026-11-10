#!/usr/bin/env node
// 089 AC-10: a pull request may not add a specclaw change folder whose number another folder already has, on the base
// branch's tip (even one the PR branch was cut before) or in the PR. amax keys a proposal by that number, so two
// folders can't share it (the sync skips both). A folder the PR itself removed or renamed (in the merge base, gone from
// the PR) no longer holds its number. Pairs already on the base branch are reported, not failed: renumbering them is
// its own decision.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const NUMBERED = /^(\d{3,})-/;

const git = (cwd, ...args) => {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (res.status !== 0) throw new Error(res.stderr.trim() || `git ${args.join(" ")} failed`);
  return res.stdout;
};

export function changeFolders(cwd, ref) {
  const out = git(cwd, "ls-tree", "--name-only", ref, ".specclaw/changes/", ".specclaw/changes/archive/");
  return [...new Set(out.split("\n").map((p) => p.split("/").at(-1)).filter((d) => NUMBERED.test(d)))];
}

const numberOf = (d) => d.match(NUMBERED)[1];
const byNumber = (dirs) => dirs.reduce((m, d) => m.set(numberOf(d), [...(m.get(numberOf(d)) ?? []), d]), new Map());

/** What the check prints: the PR's new folders that reuse a number (fail), and the base branch's own pairs (known). */
export function check(baseDirs, headDirs, mergeBaseDirs = baseDirs) {
  const head = new Set(headDirs), mergeBase = new Set(mergeBaseDirs);
  // 089 final pass: judge what the merge produces. The PR adds what head has and the merge base didn't, and removes what
  // the merge base had and head doesn't; whatever main did since (add, rename, remove) is main's own.
  const added = headDirs.filter((d) => !mergeBase.has(d));
  const removed = new Set(mergeBaseDirs.filter((d) => !head.has(d)));
  const after = byNumber([...new Set([...baseDirs.filter((d) => !removed.has(d)), ...added])]);
  const failures = added.filter((d) => after.get(numberOf(d)).length > 1)
    .map((d) => `${d}: number ${numberOf(d)} is already used by ${after.get(numberOf(d)).filter((o) => o !== d).join(", ")}; renumber it (specclaw-renumber-changes)`);
  const known = [...byNumber(baseDirs)].filter(([, ds]) => ds.length > 1).map(([n, ds]) => `${n}: ${ds.join(", ")} (already on the base branch)`);
  return { failures, known };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const cwd = opt("--root", process.cwd());
  const baseRef = opt("--base", "origin/main"), headRef = opt("--head", "HEAD");
  const mergeBase = git(cwd, "merge-base", baseRef, headRef).trim();
  const { failures, known } = check(changeFolders(cwd, baseRef), changeFolders(cwd, headRef), changeFolders(cwd, mergeBase));
  for (const k of known) console.log(`known   ${k}`);
  for (const f of failures) console.log(`fail    ${f}`);
  console.log(failures.length ? `${failures.length} change folder(s) reuse a number` : "change numbers: ok");
  process.exit(failures.length ? 1 : 0);
}
