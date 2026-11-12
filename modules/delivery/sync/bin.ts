// pnpm --filter @amax/delivery sync:specclaw --repo <path> --sha <commit> [--overlay <path>=<ref@sha>]... [--project AMX]
//   [--confirm-withdraw <n>]: confirm a held mass withdrawal, naming the count the hold reported (089).
// Env: DATABASE_URL (the app role), AMAX_SYNC_TOKEN (a service principal with delivery:proposal:sync),
// AUDIT_HASH_KEY. One-way: it never writes to the repo.
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { createDb } from "@amax/db";
import { configureRuntime } from "@amax/core/server";
import { authenticateToken, installAuthorizer, principalContext } from "@amax/auth";
import { readSpecclaw } from "./specclaw";
import { syncSpecclaw } from "./import";
import { assertSha } from "./sha";
import { authorsOf } from "./authors";

const { values } = parseArgs({
  options: { repo: { type: "string" }, overlay: { type: "string", multiple: true }, project: { type: "string", default: "AMX" }, name: { type: "string", default: "amax" },
    client: { type: "string", default: "Internal" }, sha: { type: "string" }, "confirm-withdraw": { type: "string" } },
});
const env = process.env;
for (const k of ["DATABASE_URL", "AMAX_SYNC_TOKEN", "AUDIT_HASH_KEY"]) if (!env[k]) throw new Error(`set ${k}`);
if (!values.repo) throw new Error("--repo is required");
if (!values.sha) throw new Error("--sha is required (the main commit the repo was read at)");
// 091 AC-3: checked before anything is read, so a bad sha can't leave refs that never match.
assertSha(values.sha, "--sha");
// Each overlay is <dir>=<branch>@<sha>, so every synced phase can be traced to the commit it came from.
const overlays = (values.overlay ?? []).map((o) => {
  const [dir, ref] = o.split("=");
  if (!dir || !ref) throw new Error(`--overlay must be <dir>=<branch>@<sha>, got ${o}`);
  assertSha(ref.split("@").at(-1) ?? "", `--overlay ${o}`);
  return { dir, ref };
});

const { db, client } = createDb(env.DATABASE_URL!, { max: 2 });
configureRuntime({ db, auditKey: env.AUDIT_HASH_KEY! });
installAuthorizer();
try {
  const id = await authenticateToken(db, env.AMAX_SYNC_TOKEN!);
  if (id?.kind !== "principal") throw new Error("AMAX_SYNC_TOKEN is not a live service principal token");
  const ctx = await principalContext(db, id.principal, "delivery:proposal:sync");
  // 091 AC-7: the same author lookup as the plugin and CI, so the self-sync names the same owners.
  const records = authorsOf(values.repo, values.sha, readSpecclaw({ dir: values.repo, ref: `main@${values.sha}` }, overlays));
  // 062: the commit's time moves each proposal's stale mark, so a developer's push of an older commit is refused.
  const committedAt = execFileSync("git", ["-C", values.repo, "show", "-s", "--format=%cI", values.sha!], { encoding: "utf8" }).trim();
  const r = await syncSpecclaw(db, ctx, { projectKey: values.project!, projectName: values.name!, client: values.client!, records, sha: values.sha!, committedAt,
    confirmWithdraw: /^\d+$/.test(values["confirm-withdraw"] ?? "") ? Number(values["confirm-withdraw"]) : undefined });
  console.log(`specclaw sync ${values.sha}: ${records.length} changes, ${r.created} created, ${r.updated} updated, ${r.unchanged} unchanged, ${r.withdrawn} withdrawn${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`);
  for (const s of r.skipped) console.log(`  skipped ${s}`);
} finally {
  await client.end();
}
