import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const SUBJECT = "@subject";
const script = join(__dirname, "../../../scripts/check-review-gate.mjs");

export const round = (n: number, head: string, extra: object = {}) =>
  JSON.stringify({ round: n, head, final: false, status: "open", since: null, counts: { blocker: 0 }, ...extra });

export function gateRepo() {
  const root = mkdtempSync(join(tmpdir(), "review-gate-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

  function commit({ [SUBJECT]: subject = "fixture", ...files }: Record<string, string | null>) {
    for (const [path, body] of Object.entries(files)) {
      if (body === null) {
        rmSync(join(root, path));
        continue;
      }
      mkdirSync(join(root, dirname(path)), { recursive: true });
      writeFileSync(join(root, path), body);
    }
    git("add", "-A");
    git("commit", "-qm", subject ?? "fixture");
    return git("rev-parse", "HEAD");
  }

  function init(...steps: ((head: string) => Record<string, string | null>)[]) {
    git("init", "-q");
    git("config", "user.email", "fixture@example.test");
    git("config", "user.name", "Fixture");
    steps.reduce((head, step) => commit(step(head)), "");
    git("branch", "base");
  }

  function branch(name: string, steps: ((head: string) => Record<string, string | null>)[]) {
    git("checkout", "-qb", name, "base");
    return steps.reduce((head, step) => commit(step(head)), git("rev-parse", "HEAD"));
  }

  function run(head: string, fork: boolean) {
    const res = spawnSync("node", [script, "--root", root, "--base", "base", "--head", head, "--fork", String(fork)], { encoding: "utf8" });
    return { code: res.status, out: res.stdout };
  }

  return { init, branch, run };
}
