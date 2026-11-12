import { z } from "zod";
import type { McpToolDef, ToolCard } from "@amax/core";
import { contextForViewer, type Viewer } from "@amax/auth";
import { ToolError } from "@amax/mcp";
import { acceptSuggestion, dismissSuggestion, querySuggestion } from "./decide";
import { getSuggestion, listSuggestions, type SuggestionView } from "./read";
import { agentJobs, suggestionRun } from "./runs";
import { createSuggestion, DECIDE, READ, SUGGEST, SuggestionInput } from "./store";
import { undoSuggestion } from "./undo";

type Src = "mcp" | "chat" | "api";
const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
const read = { scope: "read" as const, readOnly: true, permission: READ };
const missing = (id: string) => new ToolError(`suggestion ${id} not found`, "not_found");
const found = <T>(id: string) => (r: T | null) => r ?? Promise.reject(missing(id));
const pinOf = (r: SuggestionView | null) => (r ? { id: r.id, label: r.title, createdAt: r.createdAt } : null);
const id = z.object({ id: z.uuid().describe("The suggestion's id") });

// 081 amendment 2: the confirm card names the suggestion being decided (its title, kind and agent), not the tool and a
// raw id, and its button and receipt say the decision ("Accept", "Accepted: Move CON-018 to Verified").
type Verb = { button: string; past: string; tone?: "danger" };
const VERB: Record<string, Verb> = {
  accept: { button: "Accept", past: "Accepted" }, query: { button: "Ask the agent", past: "Asked the agent about" },
  dismiss: { button: "Dismiss", past: "Dismissed" }, undo: { button: "Undo", past: "Undone" },
};
const cardFor = (verb: Verb) => async (v: Viewer, a: { id: string; note?: string; reason?: string }): Promise<ToolCard> => {
  const s = await getSuggestion(v, a.id);
  if (!s) return { title: `${verb.button} a suggestion`, lines: [{ label: "Suggestion", value: "not found, or not one you may decide" }] };
  const second = verb.button === "Accept" && s.irreversible && s.status !== "approved";
  const why = a.note ?? a.reason;
  return {
    title: `${verb.button}: ${s.title}`,
    lines: [{ label: "Suggestion", value: s.title }, { label: "Kind", value: s.kindTitle }, { label: "From", value: `${s.agent.name}${s.actsFor ? ` for ${s.actsFor.name}` : ""}` },
      ...(s.detail ? [{ label: "Why", value: s.detail }] : []), ...(why ? [{ label: verb.button === "Ask the agent" ? "Question" : "Note", value: why }] : []),
      ...(second ? [{ label: "Then", value: "a second, different person approves it: it can't be undone" }] : [])],
    look: { kind: `${verb.button} suggestion`, subject: s.title, detail: s.kindTitle, who: `from ${s.agent.name}`, confirm: second ? "Approve" : verb.button,
      done: second ? `Approved, waiting for a second approver: ${s.title}` : `${verb.past}: ${s.title}`, ...(verb.tone ? { tone: verb.tone } : {}) },
  };
};

// 006: deciding is a person's act on chat's confirm card, never an agent's call over MCP or the API.
const decide = (name: string, description: string, input: z.ZodObject, service: ((ctx: ReturnType<typeof contextForViewer>, a: never) => Promise<unknown>) & { spec: { name: string } }) =>
  tool({ name, description, scope: "write", permission: DECIDE, input, service, card: cardFor(VERB[name.split("_")[0]]) as McpToolDef["card"], run: async (v, a, s) => {
    if (s !== "chat") throw new ToolError(`${name} is a person's decision: confirm it in amax chat`, "invalid_input");
    return service(contextForViewer(v, s), a as never);
  } });

export const agentsTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "list_agent_suggestions", description: "Agent suggestions you may decide: open (waiting for a decision), undoable (accepted, still inside the undo window) or closed. Only those inside your data scope.",
    input: z.object({ bucket: z.enum(["open", "undoable", "closed"]).optional(), kind: z.string().optional() }), run: (v, a) => listSuggestions(v, a) }),
  tool({ ...read, pin: { id: "id", of: pinOf as never }, name: "get_agent_suggestion", description: "One agent suggestion: the proposed change, evidence, confidence, source, who it acts for, and its decision and undo window.",
    input: id, run: (v, a) => getSuggestion(v, a.id).then(found(a.id)) }),
  tool({ ...read, pin: { id: "id", of: ((r: { suggestionId: string } | null) => (r ? { id: r.suggestionId, label: `Agent run for suggestion ${r.suggestionId.slice(0, 8)}` } : null)) as never }, name: "get_agent_suggestion_run",
    description: "The agent run behind a suggestion: its input, tool calls, output and cost; classified fields masked.", input: id, run: (v, a) => suggestionRun(v, a.id).then(found(a.id)) }),
  tool({ ...read, pin: "view", name: "list_agent_jobs", description: "Recurring agent jobs that make suggestions, whether each is on, and its last and next run. Switch one with set_schedule_enabled.", input: z.object({}), run: (v) => agentJobs(v) }),
  tool({ name: "suggest_change", description: "Propose a change as an agent: stored as a suggestion for a person to accept, query or dismiss. Nothing changes until they accept it.", scope: "write", permission: SUGGEST,
    input: SuggestionInput.omit({ runId: true }), service: createSuggestion, run: (v, a, s) => createSuggestion(contextForViewer(v, s), a) }),
  decide("accept_agent_suggestion", "Accept an agent suggestion: runs its change. A sensitive one needs someone other than the person the agent acted for; an irreversible one needs two different people.", id, acceptSuggestion),
  decide("query_agent_suggestion", "Query an agent suggestion: keep it open and say what the agent should check.", id.extend({ note: z.string().min(2) }), querySuggestion),
  decide("dismiss_agent_suggestion", "Dismiss an agent suggestion: nothing changes.", id.extend({ note: z.string().optional() }), dismissSuggestion),
  decide("undo_agent_suggestion", "Undo an accepted suggestion within its undo window, through the module's inverse change.", id.extend({ reason: z.string().optional() }), undoSuggestion),
];
