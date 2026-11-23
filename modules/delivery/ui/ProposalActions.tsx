import { proposalPin } from "../pins";
import type { Phase } from "../contracts";
import { AskButton } from "./AskButton";

type Actionable = { id: string; key: string; title: string; phase: Phase; source: string | null; withdrawn: boolean };
// 081 amendment 4 (AC-46): the page keeps one lifecycle button, Withdraw, a clean outlined danger button (amendment 3).
// Edit, Move and a task come from the proposal's pin in chat.
type Action = { label: string; name: string; prompt: string; tone: "withdraw" };

/**
 * 081: the lifecycle actions the viewer may run on a proposal, on its page. Each is an Ask amax prompt with the proposal
 * pinned; chat writes only after the person confirms the card. A spec proposal changes in its repo (BR-3): only its owner
 * can be changed here. Board cards have no menu (amendment 3): their actions come from their pin.
 */
function proposalActions(p: Actionable, may: (permission: string) => boolean): Action[] {
  const open = !p.withdrawn && p.phase !== "released";
  const hand = p.source === null;
  const all: [boolean, string, Action][] = [
    [open && hand, "delivery:proposal:move", { label: "Withdraw", name: `Withdraw ${p.key}`, prompt: `Withdraw ${p.key}. Reason: `, tone: "withdraw" }],
  ];
  return all.filter(([shown, permission]) => shown && may(permission)).map(([, , a]) => a);
}

export function ProposalActions({ p, may }: { p: Actionable; may: (permission: string) => boolean }) {
  const pin = proposalPin(p);
  const cls = { withdraw: "btn sm withdraw" } as const;
  return (
    <span className="row-actions" role="group" aria-label={`Ask amax about ${p.key}`}>
      {proposalActions(p, may).map((a) => <AskButton key={a.label} className={cls[a.tone]} label={a.label} name={a.name} prompt={a.prompt} pin={pin} />)}
    </span>
  );
}
