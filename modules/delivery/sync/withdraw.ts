import { isWithdrawn } from "../server/readiness";
import { readParts } from "./sha";

type Row = Record<string, unknown>;

/** "main@4f2c9a1" → "main": the ref a record or proposal was read from, without its commit. Anything else unchanged. */
export const refOf = (source: unknown) => readParts(source)?.ref ?? source;

// 089 review: one rule for every specclaw writer (sync_specclaw's push and the self-sync) on which proposals a sync
// withdraws. A proposal is eligible when it isn't withdrawn or Released, the sync read the ref that last synced it
// (`refs`: the push's default branch; the refs of the self-sync's records, so main and the branches it took changes
// from, never a branch whose only change isn't on main yet), and no newer commit has synced it (push.ts's stale rule).
// An eligible proposal whose folder the sync didn't read is withdrawn.
// A sync that read nothing withdraws nothing. One that would withdraw more than half of the eligible proposals (and
// more than two) is held: an unreadable or wrong checkout looks exactly like "every folder was deleted". A person
// confirms a real mass deletion by syncing again with `confirm` set to the held count.
export function planWithdrawals(rows: Map<string, Row>, o: { named: Set<string>; refs: Set<string>; committedAt: string; read: number; confirm?: number }) {
  const eligible = [...rows].filter(([, r]) => !isWithdrawn(r) && r.phase !== "released"
    && o.refs.has(refOf((r.meta as Row | null)?.source) as string)
    && (!r.synced_commit_at || new Date(r.synced_commit_at as string) <= new Date(o.committedAt)));
  const keys = eligible.filter(([key]) => !o.named.has(key)).map(([key]) => key);
  if (!keys.length) return { keys, held: null };
  if (!o.read) return { keys: [], held: `withdrawal held: the sync read no changes, so it can't tell which ${keys.length} were deleted` };
  if (keys.length > Math.max(2, Math.floor(eligible.length / 2)) && o.confirm !== keys.length) {
    return { keys: [], held: `withdrawal held: it would withdraw ${keys.length} of ${eligible.length} proposals (${keys.slice(0, 5).join(", ")}${keys.length > 5 ? ", …" : ""}). Check the checkout; if those folders really were deleted, sync again confirming ${keys.length} (sync_specclaw's confirmWithdraw, the CI workflow's confirm_withdraw, or sync:specclaw --confirm-withdraw)` };
  }
  return { keys, held: null };
}
