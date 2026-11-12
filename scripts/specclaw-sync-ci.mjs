#!/usr/bin/env node
// 089: CI's specclaw sync. After a merge to the default branch it pushes the repo's specclaw state to amax through the
// sync_specclaw tool (POST /api/v1/tools/sync_specclaw), as an API credential acting for the project's PM: first the
// default branch (every change), then each specclaw/* branch (only its own change, 062's rule). It reads the repo with
// the amax plugin's reader, so CI and /amax:sync-specclaw can't read a repo differently. It never writes to the repo.
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { authorsOf, isShallow, payload, readSpecclaw } from "../plugins/amax/scripts/read-specclaw.mjs";

export const MAX_PUSH = 200;
const SECRETS = ["AMAX_URL", "AMAX_SYNC_API_KEY", "AMAX_SYNC_ACT_FOR"];
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

// 091 review round 1: merged means in main's history (a merge or fast-forward), or, for a squash or rebase merge whose
// commits aren't, the branch's change folder already being on main exactly as the branch has it. Only when the branch
// has that folder: a path missing on both sides diffs as equal, and a branch named after no change must still be
// pushed, so amax flags it ("no change is named …", 091 final pass).
// 092 AC-4: by content or ancestry, never by commit times (which can't tell which side is ahead). Merged when the
// branch's last commit touching the folder is in main's history, or main has at some point held exactly the branch's
// version of the folder (a squash merge, even if main edited it after). A branch whose folder main never had as the
// branch has it (a stacked PR that brought main an older copy) is pushed.
const MAIN_HISTORY = 200;
const sameOnMain = (root, b) => {
  const path = `.specclaw/changes/${b.slice("origin/specclaw/".length)}`;
  let tree;
  try { tree = git(root, "rev-parse", `${b}:${path}`); } catch { return false; }
  try { git(root, "merge-base", "--is-ancestor", git(root, "log", "-1", "--format=%H", b, "--", path), "HEAD"); return true; } catch { /* not in main's history */ }
  const onMain = git(root, "log", `-${MAIN_HISTORY}`, "--format=%H", "HEAD", "--", path).split("\n").filter(Boolean);
  return onMain.some((c) => { try { return git(root, "rev-parse", `${c}:${path}`) === tree; } catch { return false; } });
};
const merged = (root, b) => { try { git(root, "merge-base", "--is-ancestor", b, "HEAD"); return true; } catch { return sameOnMain(root, b); } };

/**
 * The open specclaw/* branches the checkout knows, each read from its own tree (a branch without .specclaw is
 * skipped). 091 AC-1: a branch already merged into the checked-out default branch, or whose change that branch has
 * archived, is left out: its folder still says "PR raised", so pushing it would bring finished work back as Verified.
 * So is one whose change number the default branch already uses for another folder: amax can't see the default
 * branch's folders during a branch push, so the branch would take that key (its PR fails the number check anyway).
 */
function branches(root, main, out) {
  const archived = new Set(main.filter((r) => r.phase === "released").map((r) => r.dir));
  const folders = new Map();
  for (const r of main) folders.set(r.number, [...(folders.get(r.number) ?? []), r.dir]);
  const refs = git(root, "branch", "-r", "--format=%(refname:short)").split("\n").filter((b) => b.startsWith("origin/specclaw/"));
  const open = refs.filter((b) => !merged(root, b) && !archived.has(b.slice("origin/specclaw/".length)));
  if (refs.length > open.length) out.line(`left out ${refs.length - open.length} merged or archived branches`);
  const taken = (b) => {
    const dir = b.slice("origin/specclaw/".length), others = (folders.get(dir.match(/^(\d{3,})-/)?.[1]) ?? []).filter((d) => d !== dir);
    if (others.length) out.warn(`${b.slice("origin/".length)}: left out, its number is already used on the default branch by ${others.join(", ")}; renumber it`);
    return others.length > 0;
  };
  return open.filter((b) => !taken(b)).flatMap((b) => {
    try { git(root, "cat-file", "-e", `${b}:.specclaw`); } catch { return []; }
    const dir = mkdtempSync(join(tmpdir(), "specclaw-branch-"));
    execFileSync("tar", ["-x", "-C", dir], { input: execFileSync("git", ["archive", b, ".specclaw"], { cwd: root, maxBuffer: 256 * 1024 * 1024 }) });
    const sha = git(root, "rev-parse", b), ref = b.slice("origin/".length);
    return [{ ref, sha, committedAt: git(root, "show", "-s", "--format=%cI", b), records: authorsOf(root, sha, readSpecclaw({ dir, ref: `${ref}@${sha}` }), ref.slice("specclaw/".length)), dir }];
  });
}

async function call(env, fetchImpl, args) {
  const res = await fetchImpl(`${env.AMAX_URL.replace(/\/+$/, "")}/api/v1/tools/sync_specclaw`, {
    method: "POST", headers: { authorization: `Bearer ${env.AMAX_SYNC_API_KEY}`, "amax-act-for": env.AMAX_SYNC_ACT_FOR, "content-type": "application/json" }, body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`amax answered ${res.status}: ${body.message ?? body.error ?? "no reason given"}`);
  return body.result;
}

/** One ref's pushes, in batches of MAX_PUSH. Only a single-batch default-branch push may withdraw gone folders. */
async function pushRef(env, fetchImpl, base, records, onDefault, out) {
  const batches = [];
  for (let i = 0; i < Math.max(records.length, 1); i += MAX_PUSH) batches.push(records.slice(i, i + MAX_PUSH));
  if (onDefault && batches.length > 1) out.warn(`${base.ref}: more than ${MAX_PUSH} changes, so withdrawal is skipped this run`);
  for (const batch of batches) {
    const whole = onDefault && batches.length === 1;
    const confirm = whole && /^\d+$/.test(env.AMAX_CONFIRM_WITHDRAW ?? "") ? { confirmWithdraw: Number(env.AMAX_CONFIRM_WITHDRAW) } : {};
    const r = await call(env, fetchImpl, { ...base, records: batch, dryRun: false, withdrawMissing: whole, ...confirm });
    if (r.outcome === "refused") throw new Error(`${base.ref} ${base.sha.slice(0, 7)} → ${base.projectKey}: refused: ${r.reason}`);
    out.line(`${base.ref} ${base.sha.slice(0, 7)} → ${base.projectKey}: ${r.outcome}`);
    out.line(`  ${r.created} created · ${r.updated} updated · ${r.withdrawn ?? 0} withdrawn · ${r.unchanged} unchanged · ${r.skipped.length} skipped${r.ignored ? ` · ${r.ignored} not this branch's` : ""}`);
    for (const s of r.skipped) out.warn(s);
  }
}

export async function run({ env = process.env, root = process.cwd(), fetchImpl = fetch, out }) {
  const missing = SECRETS.filter((k) => !env[k]);
  if (missing.length === SECRETS.length) {
    out.notice(`specclaw sync is not set up, so nothing was synced. Add ${SECRETS.join(", ")} to run it.`);
    return 0;
  }
  if (missing.length) {
    out.error(`specclaw sync is only partly set up: ${missing.join(", ")} missing. Add ${missing.length === 1 ? "it" : "them"} or remove the others.`);
    return 1;
  }
  // 091 AC-7: authors need full history; a shallow clone reads as "unknown", so amax keeps the owners it has.
  if (isShallow(root)) out.warn("shallow clone: change authors can't be read, so owners are left as they are (check out with fetch-depth 0)");
  const main = payload(root);
  if (!main.records.length) {
    out.error(`read no specclaw changes on ${main.ref}: nothing was pushed, so nothing could be withdrawn by mistake`);
    return 1;
  }
  out.line(`specclaw sync → ${env.AMAX_URL.replace(/\/+$/, "")}/api/v1/tools/sync_specclaw`);
  let failed = 0;
  const attempt = async (fn) => { try { await fn(); } catch (e) { failed++; out.error(e.message); } };
  const { records, ...base } = main;
  await attempt(() => pushRef(env, fetchImpl, base, records, true, out));
  for (const b of branches(root, records, out)) {
    await attempt(() => pushRef(env, fetchImpl, { projectKey: main.projectKey, repoUrl: main.repoUrl, ref: b.ref, sha: b.sha, committedAt: b.committedAt }, b.records, false, out));
    rmSync(b.dir, { recursive: true, force: true });
  }
  return failed ? 1 : 0;
}

/** GitHub Actions output: workflow commands for notices and warnings, and the job summary. */
export const actionsOut = (env = process.env) => {
  const summary = (text) => env.GITHUB_STEP_SUMMARY && appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
  return {
    line: (t) => { console.log(t); summary(`    ${t}`); },
    notice: (t) => { console.log(`::notice title=specclaw sync::${t}`); summary(`> ${t}`); },
    warn: (t) => { console.log(`::warning title=specclaw sync::${t}`); summary(`    ⚠ ${t}`); },
    error: (t) => { console.log(`::error title=specclaw sync::${t}`); summary(`    ✗ ${t}`); },
  };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await run({ out: actionsOut() }));
}
