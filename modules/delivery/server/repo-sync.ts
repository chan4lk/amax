import { sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "@amax/db";
import { assertCan, can, viewerOf, type Viewer } from "@amax/auth";
import { defineService, ForbiddenError, getRuntime } from "@amax/core/server";
import { normaliseRepo, RepoUrl } from "../sync/repo-url";
import { byLine, whoJoins } from "./activity";
import { invalid, notFound } from "./refusal";

// 062: the one repo a project's specclaw pushes are accepted from (push.ts), and the project's
// Repo sync card: the linked repo and its recent pushes.


export const linkProjectRepo = defineService({
  scoped: true,
  name: "delivery.project.repo",
  action: "delivery:project:link",
  resource: "delivery.project",
  input: z.object({ projectKey: z.string(), repoUrl: RepoUrl.nullable(), defaultBranch: z.string().min(1).max(200).optional() }),
  async run(tx, input, ctx) {
    const [p] = await tx.execute(sql`select id, repo_url, repo_default_ref from delivery.project where key = ${input.projectKey}`);
    if (!p) throw notFound(`no project ${input.projectKey}`);
    const v = viewerOf(ctx);
    if (v) assertCan(v, "delivery:project:link", { projectId: p.id as string });
    const repoUrl = input.repoUrl ? normaliseRepo(input.repoUrl) : null;
    // The default branch is stored with the link, never taken from a push: it decides which pushes cover every change.
    // A relink to the same repo keeps the stored branch unless one is given; a first link or another repo must name it.
    const defaultRef = repoUrl ? input.defaultBranch ?? (repoUrl === p.repo_url ? (p.repo_default_ref as string | null) : null) : null;
    if (repoUrl && !defaultRef) throw invalid(`name ${input.projectKey}'s default branch (for example main) when linking its repo`);
    await tx.execute(sql`update delivery.project set repo_url = ${repoUrl}, repo_default_ref = ${defaultRef} where id = ${p.id}`);
    return { result: { projectKey: input.projectKey, repoUrl, defaultBranch: defaultRef }, resourceId: p.id as string, before: { repoUrl: p.repo_url, defaultBranch: p.repo_default_ref }, after: { repoUrl, defaultBranch: defaultRef } };
  },
});

const read = <T>(viewer: Viewer, fn: (tx: Tx) => Promise<T>) => {
  if (!can(viewer, "delivery:read")) throw new ForbiddenError("delivery:read", "delivery");
  return withTenant(getRuntime().db, viewer.tenantId, fn);
};

// Who pushed, as recorded: the person by name (their MCP client is not known), or the credential or agent for them.
const pushBy = (r: Record<string, unknown>) => (r.actor_kind === "user" ? String(r.actor_name ?? "Someone") : byLine(r as never));

export type PushRow = { id: string; at: string; by: string; ref: string; sha: string; outcome: "applied" | "refused"; created: number; updated: number; unchanged: number; withdrawn: number; skipped: string[]; needsReview: boolean; reason: string | null; projectKey: string };
const push = (r: Record<string, unknown>): PushRow => ({
  id: r.id as string, at: new Date(r.at as string).toISOString(), by: pushBy(r), ref: r.ref as string, sha: r.sha as string, outcome: r.outcome as PushRow["outcome"],
  created: Number(r.created), updated: Number(r.updated), unchanged: Number(r.unchanged), withdrawn: Number(r.withdrawn ?? 0), skipped: r.skipped as string[],
  needsReview: r.needs_review === true, reason: (r.reason as string | null) ?? null, projectKey: r.project_key as string,
});
const pushes = (where: ReturnType<typeof sql>, limit: number) => sql`select a.*, pr.key as project_key, au.name as actor_name, sp.name as principal_name, fu.name as for_name
  from delivery.sync_push a join delivery.project pr on pr.id = a.project_id ${whoJoins} where ${where} order by a.at desc limit ${limit}`;

/** A project's Repo sync card: its linked repo and recent pushes, newest first. */
export const getRepoSync = (viewer: Viewer, a: { projectId?: string; projectKey?: string }) => read(viewer, async (tx) => {
  const [p] = await tx.execute(a.projectId ? sql`select id, key, name, repo_url from delivery.project where id = ${a.projectId}` : sql`select id, key, name, repo_url from delivery.project where key = ${a.projectKey ?? ""}`);
  if (!p) return null;
  const recent = (await tx.execute(pushes(sql`a.project_id = ${p.id}`, 20))).map(push);
  // Read on its own: a run of refused pushes can fill the recent list.
  const [last] = (await tx.execute(pushes(sql`a.project_id = ${p.id} and a.outcome = 'applied'`, 1))).map(push);
  return { project: { id: p.id as string, key: p.key as string, name: p.name as string }, repoUrl: (p.repo_url as string | null) ?? null, lastApplied: last ?? null, recent };
});

/** One push, for its pin. */
export const getSyncPush = (viewer: Viewer, id: string) => read(viewer, async (tx) => (await tx.execute(pushes(sql`a.id = ${id}`, 1))).map(push)[0] ?? null);
