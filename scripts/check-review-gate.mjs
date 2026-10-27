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

const changes = [...touchedChangeDirs(files)].map(([name, dir]) => ({
  name,
  changeMd: show(`${dir}/change.md`),
  rounds: lines(git("ls-tree", "--name-only", head, `${dir}/review/`).stdout)
    .filter((path) => /\/round-\d+\.json$/.test(path))
    .map((path) => JSON.parse(show(path))),
})).filter((change) => change.changeMd !== null);

const isAncestor = (sha) => git("merge-base", "--is-ancestor", sha, head).status === 0;
const result = gate({ fork, files, changes, isAncestor });
console.log(result.lines.join("\n"));
process.exit(result.ok ? 0 : 1);
