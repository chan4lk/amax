import { z } from "zod";
import { logError, type GitHubCallback } from "@amax/core/server";
import type { ResultCode } from "../words";
import { completeConnect, recordReturn, resultCodeOf } from "./connect";

const Query = z.object({ state: z.string().min(16).max(200), code: z.string().min(1).max(200) });

/**
 * 108 AC-2, AC-3, AC-11: GitHub's return, owned by the module; the app's route only reads the core-declared slot, so
 * removing the module leaves the app building. Every return is recorded on the state it carries, and the screen is sent
 * that record's id, so its note is about this return and comes from the record, never the URL (112 AC-2).
 */
export const githubCallback: GitHubCallback = async (ctx, params) => {
  const { code, claimId, held } = await outcome(ctx, params);
  const state = typeof params.state === "string" ? params.state : "";
  // A success's reference is its own claim; a failure is recorded by the claim it held, or only while nobody holds one.
  const ref = claimId ?? (state
    ? (await recordReturn(ctx, { state, result: code, ...(held ? { claimId: held } : {}) }).catch((e: unknown) => { logError("git-accounts.result", e); return { id: null }; })).id
    : null);
  const query: Record<string, string> = { github: "1" };
  if (ref) query.ref = ref;
  return query;
};

/** What this return came to, as a result code, and on success the claim it stored against. */
async function outcome(ctx: Parameters<GitHubCallback>[0], params: Record<string, string>): Promise<{ code: Exclude<ResultCode, "connected">; claimId?: undefined; held?: string } | { code: "connected"; claimId: string; held?: undefined }> {
  if (params.error) return { code: params.error === "access_denied" ? "denied" : "incomplete" };
  const q = Query.safeParse(params);
  if (!q.success) return { code: "incomplete" };
  try {
    const r = await completeConnect(ctx, q.data);
    return { code: "connected", claimId: r.claimId };
  } catch (e) {
    const code = resultCodeOf(e);
    if (code === "error") logError("git-accounts.callback", e);
    const held = (e as { claimId?: unknown } | null)?.claimId;
    return { code: code as Exclude<ResultCode, "connected">, ...(typeof held === "string" ? { held } : {}) };
  }
}
