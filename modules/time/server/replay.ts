import type { Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { getProjectRef } from "@amax/delivery/contracts";
import { ctxFor } from "./context";
import { bySource, logTime } from "./log";
import { read } from "./read";

type Log = { projectKey: string; hours: number; day: string; billable?: boolean; note?: string; agent?: string; clientRef?: string };

/**
 * 071 AC-8: `log_time` with a `clientRef` logs once. A retry with the same input returns the first entry, writing
 * nothing (no entry, audit row or event); the same ref with other input is refused; of two concurrent calls the
 * unique index lets one in and the other reads its entry.
 */
export async function logOnce(v: Viewer, a: Log, s: "mcp" | "chat" | "api") {
  const run = () => logTime(ctxFor(v, s), { ...a, source: s === "mcp" ? "agent" : "person" });
  if (!a.clientRef) return run();
  const ref = `mcp:${a.clientRef}`;
  const replay = async () => {
    const found = await read(v, async (tx) => ({ had: await bySource(tx, v.userId, ref), project: await getProjectRef(tx, a.projectKey) }));
    if (!found.had) return null;
    // Every field of the input, note and agent included (071 review round 1): anything else is a different entry.
    const same = found.had.projectId === found.project?.id && found.had.day === a.day && found.had.hours === a.hours && found.had.billable === (a.billable ?? true)
      && found.had.note === (a.note ?? null) && found.had.agent === (a.agent ?? null);
    if (!same) throw new ToolError("clientRef already used for a different entry", "invalid_input");
    return { id: found.had.id, day: found.had.day, hours: found.had.hours, replayed: true };
  };
  return (await replay()) ?? run().catch(async (e: Error & { code?: string; cause?: { code?: string } }) => {
    if (e.code === "source_taken" || e.cause?.code === "source_taken") return (await replay()) ?? Promise.reject(e);
    throw e;
  });
}
