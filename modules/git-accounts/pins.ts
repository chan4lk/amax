import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

// 108 AC-6: each verified email is pinned by its identity id; the label is the email as it is now.
export const identityPin = (e: { id: string; email: string }): PinRef => ({ label: e.email, tool: "get_my_git_identity", args: { identityId: e.id } });
export const identityOf = (r: { id: string; email: string } | null): PinnedRecord | null => (r ? { id: r.id, label: identityPin(r).label } : null);

export const accountsPin: PinRef = { label: "Your Git accounts", tool: "get_my_git_identities", args: {} };
