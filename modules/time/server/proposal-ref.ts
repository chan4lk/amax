import { ToolError } from "@amax/mcp";
import type { Tx } from "@amax/db";
import { getProposalRef, type ProposalRef } from "@amax/delivery/contracts";

/** 081 AC-1: why an entry on `projectId` can't name the proposal `key`; null when it can. */
export function proposalRefusal(ref: ProposalRef | null, key: string, projectId: string, projectKey: string) {
  if (!ref) return `no proposal ${key}`;
  if (ref.projectId !== projectId) return `${ref.key} belongs to ${ref.projectKey}, not ${projectKey}; log it on ${ref.projectKey} or leave the proposal out`;
  if (ref.withdrawn) return `${ref.key} was withdrawn; log the hours on ${projectKey} without it`;
  return null;
}

/** The proposal an entry names, checked through Delivery's contract; null when none is named. */
export async function proposalOf(tx: Tx, key: string | null | undefined, project: { id: string; key: string }) {
  if (!key) return null;
  const ref = await getProposalRef(tx, key);
  const refused = proposalRefusal(ref, key, project.id, project.key);
  if (refused) throw new ToolError(refused, ref ? "invalid_input" : "not_found");
  return ref!;
}
