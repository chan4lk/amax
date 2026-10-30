#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { gate, touchedChangeDirs } from "./review-gate/rules.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = opt("--base", "origin/main");
const head = opt("--head", "HEAD");
const fork = opt("--fork", "false") === "true";
const cwd = opt("--root", process.cwd());

const git = (...argv) => spawnSync("git", argv, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const lines = (out) => out.split("\n").filter(Boolean);
const show = (path) => {
  const res = git("show", `${head}:${path}`);
  return res.status === 0 ? res.stdout : null;
};

const diff = git("diff", "--name-only", `${base}...${head}`);
if (diff.status !== 0) {
  console.error(diff.stderr.trim());
  process.exit(2);
}
const files = lines(diff.stdout);

const readChange = (name, dir) => ({
  name,
  changeMd: show(`${dir}/change.md`),
  rounds: lines(git("ls-tree", "--name-only", head, `${dir}/review/`).stdout)
    .filter((path) => /\/round-\d+\.json$/.test(path))
    .map((path) => JSON.parse(show(path))),
});
const changes = [...touchedChangeDirs(files)].map(([name, dir]) => readChange(name, dir))
  .filter((change) => change.changeMd !== null);
const load = (name) => [`.specclaw/changes/${name}`, `.specclaw/changes/archive/${name}`]
  .map((dir) => readChange(name, dir)).find((change) => change.changeMd !== null) ?? null;

const ancestor = (sha, of) => git("merge-base", "--is-ancestor", sha, of).status === 0;
const inBase = (sha) => {
  const res = git("merge-base", "--is-ancestor", sha, base);
  if (res.status > 1) throw new Error(`could not check whether ${sha} is in the base: ${res.stderr.trim()}`);
  return res.status === 0;
};
const must = (...argv) => {
  const res = git(...argv);
  if (res.status !== 0) throw new Error(`git ${argv[0]} failed: ${res.stderr.trim()}`);
  return res.stdout;
};
const commit = (sha) => {
  const [parents, subject] = must("show", "-s", "--format=%P%x00%s", sha).trim().split("\0");
  const paths = lines(must("show", "--name-only", "--format=", "--diff-merges=first-parent", sha));
  return {
    sha,
    subject,
    recordsOnly: paths.length > 0 && paths.every((path) => path.startsWith(".specclaw/")),
    merge: parents.split(" ").length > 1,
  };
};
const repo = {
  isAncestor: (sha, of = head) => ancestor(sha, of),
  inBase,
  history: (name) => lines(must("rev-list", `${base}..${head}`, "--", `.specclaw/changes/${name}`, `.specclaw/changes/archive/${name}`)),
  after: (sha) => lines(must("rev-list", `${base}..${head}`, `^${sha}`)).map(commit),
};
const result = gate({ fork, files, changes, load, repo });
console.log(result.lines.join("\n"));
process.exit(result.ok ? 0 : 1);
