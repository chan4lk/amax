import type { ChatSuggestion } from "@amax/core";
import { can, canEver, type Viewer } from "@amax/auth";
import { PHASES, proposalKeyFrom } from "./contracts";
import { getProject, getProposal, manualProjects } from "./server/queries";

// 081 AC-13: what chat offers on Delivery's pages, each only when the viewer can do it there. A suggestion fills the
// message box; chat still confirms the write.
type P = Record<string, string>;
const isKey = (p: P) => Boolean(p.phase) && !(PHASES as readonly string[]).includes(p.phase);
const when = (check: (v: Viewer, p: P) => Promise<boolean>) => check as ChatSuggestion["when"];

const project = (v: Viewer, p: P) => getProject(v, p.key);
const proposal = (v: Viewer, p: P) => getProposal(v, { key: proposalKeyFrom(p.phase) });
const openHandMade = async (v: Viewer, p: P, permission: string) => {
  if (!isKey(p)) return false;
  const r = await proposal(v, p);
  const id = r ? (await project(v, { key: r.projectKey }))?.project.id : undefined;
  return Boolean(r && id && r.source === null && !r.withdrawn && r.phase !== "released" && can(v, permission, { projectId: id }));
};

const PROJECT = ["p/:key", "p/:key/proposals", "p/:key/proposals/:phase"];
const LIST = ["proposals", "proposals/:phase"];

export const chatSuggestions: ChatSuggestion[] = [
  { routes: PROJECT, label: "New proposal", prompt: "Add a proposal to this project: ", tool: "create_proposal",
    // 093 AC-4: never on an agent-first project, whose proposals come from its repo.
    when: when(async (v, p) => { const r = await project(v, p); return Boolean(r && !r.project.agentFirst && can(v, "delivery:proposal:create", { projectId: r.project.id })); }) },
  { routes: LIST, label: "New proposal", prompt: "Add a proposal to ", tool: "create_proposal", when: when(async (v, p) => !isKey(p) && canEver(v, "delivery:proposal:create") && (await manualProjects(v)).length > 0) },
  // 081 amendment 9 (AC-88): what you own, read with list_proposals' mine.
  { routes: [...LIST, "p/:key/proposals", "p/:key/proposals/:phase"], label: "What proposals do I own?", prompt: "What proposals do I own?", tool: "list_proposals", when: when(async (_v, p) => !isKey(p)) },
  { routes: LIST, label: "Add a task", prompt: "Add a task to this proposal: ", tool: "add_proposal_task", when: when((v, p) => openHandMade(v, p, "delivery:task:done")) },
  { routes: LIST, label: "Edit this proposal", prompt: "Change this proposal: ", tool: "update_proposal", when: when((v, p) => openHandMade(v, p, "delivery:proposal:create")) },
  { routes: LIST, label: "Withdraw it", prompt: "Withdraw this proposal. Reason: ", tool: "withdraw_proposal", when: when((v, p) => openHandMade(v, p, "delivery:proposal:move")) },
];

/** The page's record in chat's header: the proposal on its page, the project on its pages. */
export const pageLabel = (p: P) => (isKey(p) ? proposalKeyFrom(p.phase) : p.key ?? null);
