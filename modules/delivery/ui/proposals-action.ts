/**
 * 094 AC-8: what the Proposals page's header offers. Filtered to one project: its repo line when it's agent-first, else
 * "New proposal" when the viewer can add there. Across projects: agentic first, so when some project is agent-first the
 * repo line leads and manual creation is a secondary "Add by hand" (only while some project still takes them by hand).
 */
export type ProposalsAction =
  | { kind: "repo-line"; repoUrl?: string; addByHand: boolean }
  | { kind: "new-proposal" }
  | { kind: "none" };

type P = { key: string; agentFirst: boolean; repoUrl: string | null };

export function proposalsAction(projects: P[], manualKeys: string[], filtered?: P): ProposalsAction {
  if (filtered) {
    if (filtered.agentFirst && filtered.repoUrl) return { kind: "repo-line", repoUrl: filtered.repoUrl, addByHand: false };
    return manualKeys.includes(filtered.key) ? { kind: "new-proposal" } : { kind: "none" };
  }
  if (projects.some((p) => p.agentFirst)) return { kind: "repo-line", addByHand: manualKeys.length > 0 };
  return manualKeys.length > 0 ? { kind: "new-proposal" } : { kind: "none" };
}
