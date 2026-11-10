// 062: what the amax plugin sends to sync_specclaw, read from the current repo. Bundled into
// ../read-specclaw.mjs (pnpm build:plugin) so the plugin runs with plain node and parses specclaw
// exactly as amax's own importer does. One-way: it never writes to the repo.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { normaliseRepo } from "../../../../modules/delivery/sync/repo-name";
import { readSpecclaw } from "../../../../modules/delivery/sync/specclaw";
import { authorsOf, isShallow } from "../../../../modules/delivery/sync/authors";

export { authorsOf, isShallow, normaliseRepo, readSpecclaw };

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** `amax:\n  project: AMX` in .specclaw/config.yaml, unless --project names it. */
export const projectOf = (root: string, flag?: string) => {
  if (flag) return flag;
  const config = join(root, ".specclaw/config.yaml");
  const m = existsSync(config) ? readFileSync(config, "utf8").match(/^amax:\s*\n\s+project:\s*["']?([A-Z][A-Z0-9]{1,9})["']?\s*$/m) : null;
  return m?.[1] ?? null;
};

export function payload(cwd: string, flag?: string) {
  const root = git(cwd, "rev-parse", "--show-toplevel");
  const projectKey = projectOf(root, flag);
  if (!projectKey) throw new Error("no amax project: add `amax:\\n  project: <KEY>` to .specclaw/config.yaml, or pass --project <KEY>");
  // The sha must describe what is sent, so uncommitted specclaw edits stop the push.
  if (git(root, "status", "--porcelain", "--", ".specclaw")) throw new Error(".specclaw has uncommitted changes: commit them, then sync");
  const ref = git(root, "rev-parse", "--abbrev-ref", "HEAD");
  const sha = git(root, "rev-parse", "HEAD");
  return {
    // Only the repo's normalised name is sent: a remote URL can carry a token, and amax never needs it.
    projectKey, repoUrl: normaliseRepo(git(root, "remote", "get-url", "origin")), ref, sha,
    committedAt: git(root, "show", "-s", "--format=%cI", "HEAD"),
    records: authorsOf(root, sha, readSpecclaw({ dir: root, ref: `${ref}@${sha}` })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf("--project");
  try {
    process.stdout.write(JSON.stringify(payload(process.cwd(), i > 0 ? process.argv[i + 1] : undefined)));
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    process.exit(1);
  }
}
