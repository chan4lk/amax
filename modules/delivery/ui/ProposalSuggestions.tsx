import type { Viewer } from "@amax/auth";
import { listSuggestions, type SuggestionView } from "@amax/agents/server";
import { PinButton, type PinRef } from "@amax/ui";
import { AskButton } from "./AskButton";
import { day } from "./parts";

// 081 amendment 2 (AC-35): what the Delivery agent suggests about a proposal, where the proposal is. Deciding happens in
// chat (Ask amax, then the confirm card), as on Allocations; evidence, runs and history are on the Suggestions screen.
// listSuggestions returns only what the viewer may decide (the kind's permission on the proposal's project).
const DELIVERY = /^delivery\.proposal-/;

/** Open suggestions, and accepted ones still inside their undo window, about these proposals. */
export async function proposalSuggestions(v: Viewer, proposalIds?: string[]) {
  const ids = proposalIds ? new Set(proposalIds) : null;
  const of = async (bucket: "open" | "undoable") => (await listSuggestions(v, { bucket, ...(ids?.size === 1 ? { targetId: [...ids][0] } : {}) }))
    .filter((s) => DELIVERY.test(s.kind) && (!ids || ids.has(s.target.id)));
  const [open, undoable] = await Promise.all([of("open"), of("undoable")]);
  return { open, undoable };
}

const pinOf = (s: SuggestionView): PinRef => ({ label: s.title, tool: "get_agent_suggestion", args: { id: s.id } });
const ask = (verb: string, s: SuggestionView) => `${verb} the suggestion "${s.title}" (suggestion id ${s.id})`;

export function ProposalSuggestions({ open, undoable }: { open: SuggestionView[]; undoable: SuggestionView[] }) {
  if (!open.length && !undoable.length) return null;
  return (
    <div className="card pinnable suggested gap-below">
      <div className="card-head"><h2>Suggested by amax</h2><span className="chip agent">An agent suggests, a person decides</span><a className="btn sm" href="/suggestions">All suggestions</a></div>
      <ul className="suggested-list">
        {open.map((s) => (
          <li key={s.id} className="pinnable">
            <div><b>{s.kindTitle}:</b> {s.title}{s.detail && <small className="muted">{s.detail} {s.agent.name} · until {day(s.expiresAt)}</small>}</div>
            <span className="row-actions" role="group" aria-label={`Decide: ${s.title}`}>
              <AskButton spark className="btn sm primary" label="Ask amax to accept" name={`Ask amax to accept ${s.title}`} prompt={ask("Accept", s)} pin={pinOf(s)} />
              <AskButton className="btn sm link" label="Dismiss" name={`Dismiss ${s.title}`} prompt={ask("Dismiss", s)} pin={pinOf(s)} />
              <PinButton pin={pinOf(s)} />
            </span>
          </li>
        ))}
        {undoable.map((s) => (
          <li key={s.id} className="pinnable">
            <div><span className="chip good">Accepted</span> {s.title}<small className="muted">{s.decidedBy ? `By ${s.decidedBy.name}` : "Accepted"}{s.undoUntil ? ` · can be undone until ${day(s.undoUntil)}` : ""}</small></div>
            <span className="row-actions" role="group" aria-label={`Undo: ${s.title}`}>
              <AskButton className="btn sm" label="Ask amax to undo" name={`Ask amax to undo ${s.title}`} prompt={ask("Undo", s)} pin={pinOf(s)} />
              <PinButton pin={pinOf(s)} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
