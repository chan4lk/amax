import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { installAuthorizer, loadViewer, setGrants, setViewerScopeResolvers, signInDemo } from "@amax/auth";
import { linkGitIdentity } from "@amax/auth/git-identity";
import { authFixtures } from "@amax/auth/fixtures";
import { loadFixtures, lumen } from "@amax/testing";
import delivery from "../module";
import { ctxFor } from "../server/context";
import { linkProjectRepo } from "../server/repo-sync";
import { pushSpecclaw } from "../server/push";
import { readSpecclaw } from "../sync/specclaw";

export const T = lumen.tenant.id;
export const REPO = "https://github.com/example/fleet-tracker.git";
export const sha = (n: number) => `c0ffee${String(n).padStart(34, "0")}`;
export const at = (h: string, day = "2026-11-12") => `${day}T${h}:00Z`;
export type Commit = { id: string; email: string; at: string };
export const commit = (n: number, email: string, when: string): Commit => ({ id: sha(n), email, at: when });

/** A repo with one change folder, archived or not, read as the plugin reads it, carrying `commits`. */
export function fakeRepo(commits: Commit[], dir = "101-export", archived = false) {
  const root = mkdtempSync(join(tmpdir(), "amax-104-"));
  const base = join(root, ".specclaw/changes", archived ? "archive" : "", dir);
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, "change.md"), `# ${dir} title\n\n**Change:** ${dir}\n\n\n`);
  writeFileSync(join(base, "status.md"), "| Proposal | ✅ Approved | |\n");
  return readSpecclaw(root).map((r) => ({ ...r, commits }));
}

/** 104: Delivery with FLT linked to REPO, and Nimal and Ayesha (both LK) holding verified git identities. */
export async function syncTimeDb() {
  const t = await migratedDatabase();
  const app = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  setGrants([delivery]);
  setViewerScopeResolvers([delivery.viewerScopes!]);
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, delivery], lumen);
  await withTenant(app, T, (tx) => tx.execute(sql`insert into auth.role_assignment (tenant_id, user_id, role, source)
    select ${T}, id, 'PM', 'manual' from auth.user where email = 'nimal@lumenlabs.test'`));
  const as = async (key: string) => (await loadViewer(app, T, (await signInDemo(app, T, `${key}@lumenlabs.test`)).sessionId))!;
  const nimal = await as("nimal");
  const ayesha = await as("ayesha");
  await linkProjectRepo(ctxFor(nimal), { projectKey: "FLT", repoUrl: REPO, defaultBranch: "main" });
  for (const [v, login] of [[nimal, "nimal-gh"], [ayesha, "ayesha-gh"]] as const)
    await withTenant(app, T, (tx) => linkGitIdentity(tx, T, { provider: "github", login, email: `${login.split("-")[0]}@lumenlabs.test`, userId: v.userId }));
  let n = 0;
  const push = (records: ReturnType<typeof fakeRepo>, by = nimal) =>
    pushSpecclaw(by, { projectKey: "FLT", repoUrl: REPO, ref: "main", sha: `a1b2c${String(++n).padStart(2, "0")}`, committedAt: `2026-11-12T${String(9 + n).padStart(2, "0")}:00:00Z`, records, dryRun: false });
  const q = (query: ReturnType<typeof sql>) => withTenant(app, T, (tx) => tx.execute(query));
  const drafts = async () => (await q(sql`select payload from core.event where name = 'delivery.commit.time' order by created_at, id`)).map((e) => e.payload as Record<string, unknown>);
  /** Commit time on for the LK entity from `since`. */
  const consent = (since: string) => t.owner`insert into delivery.commit_time (tenant_id, legal_entity_id, enabled, notified_at, set_by)
    values (${T}, ${lumen.entities[0].id}, true, ${since}, 'test') on conflict (tenant_id, legal_entity_id) do update set enabled = true, notified_at = excluded.notified_at`;
  return { t, app, nimal, ayesha, push, q, drafts, consent };
}
