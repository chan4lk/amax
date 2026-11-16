import type { ReactNode } from "react";
import type { Edits, FieldCheck, PendingAction } from "@amax/chat";
import { FormConfirm } from "./FormConfirm";

// 073: the confirm card. What it is and whose record it touches, the one figure to check, the details as an aligned list,
// and one decision: a button that names the action (red when it destroys something), with Edit and Cancel kept quiet.
// Nothing is saved until the person confirms; once done, the card folds to a one-line receipt.
type State = "open" | "working" | "done" | "error" | "expired" | "cancelled";
/** 106: a card with a `form` shows its fields instead of its lines; `field` places a refusal next to the field it is about. */
type Props = {
  action: PendingAction; state: State; note?: string; field?: string; onConfirm: (edits?: Edits) => void; onEdit: () => void; onCancel: () => void;
  onCheck?: (edits: Edits) => Promise<FieldCheck>; onNext?: (prompt: string) => void; secret?: ReactNode; after?: ReactNode;
};

const MAX_LINES = 5;
// "yes" / "no" read as values, not words in a sentence.
const tidy = (v: string) => (v === "yes" || v === "no" ? v[0].toUpperCase() + v.slice(1) : v);

/** The details as an aligned list, folding past MAX_LINES (076: the choice card shows the picked option's too). */
export function Lines({ lines }: { lines: { label: string; value: string }[] }) {
  const row = (l: { label: string; value: string }, i: number) => <div key={i} className="cc-row"><dt>{l.label}</dt><dd>{tidy(l.value)}</dd></div>;
  if (lines.length <= MAX_LINES + 1) return <dl className="cc-lines">{lines.map(row)}</dl>;
  return (
    <dl className="cc-lines">
      {lines.slice(0, MAX_LINES).map(row)}
      <details className="cc-more"><summary>+ {lines.length - MAX_LINES} more</summary>{lines.slice(MAX_LINES).map((l, i) => row(l, MAX_LINES + i))}</details>
    </dl>
  );
}

export function ConfirmCard({ action, state, note, field, onConfirm, onEdit, onCancel, onCheck, onNext, secret, after }: Props) {
  const look = action.look ?? {};
  const lines = action.lines ?? Object.entries(action.input).map(([label, v]) => ({ label, value: typeof v === "string" ? v : JSON.stringify(v) }));
  const danger = look.tone === "danger";
  const editing = Boolean(action.form) && (state === "open" || state === "working");
  if (state === "done" || state === "cancelled") {
    const done = state === "done";
    return (
      <div className={`b cc ${state}`} role="group" aria-label={`Confirm: ${action.title}`}>
        <p className="cc-receipt"><span className="cc-tick" aria-hidden="true">{done ? "✓" : "✕"}</span>{note ?? (done ? "Done:" : `Cancelled: ${action.title}`)}</p>{after}
        {done && look.next && onNext && <div className="c-answers"><button type="button" className="chip" onClick={() => onNext(look.next!.prompt)}>{look.next.label}</button></div>}
      </div>
    );
  }
  return (
    <div className={`b cc${danger ? " danger" : ""}`} role="group" aria-label={`Confirm: ${action.title}`}>
      <div className="cc-top"><span className="cc-eyebrow">Confirm · {look.kind ?? "Change"}</span>{look.who && <span className="cc-who">{look.who}</span>}</div>
      {look.figure ? (
        <div className="cc-fig"><span className="cc-num">{look.figure}</span><span className="cc-sub"><b>{look.subject ?? action.title}</b>{look.detail && <small>{look.detail}</small>}</span></div>
      ) : <p className="cc-title">{action.title}</p>}
      {!(editing && onCheck) && lines.length > 0 && <Lines lines={lines} />}
      {editing && onCheck ? (
        <>
          <FormConfirm form={action.form!} input={action.input} fallback={look.confirm ?? "Add it"} busy={state === "working"} note={state === "open" ? note : undefined} field={field}
            onConfirm={onConfirm} onEdit={onEdit} onCancel={onCancel} onCheck={onCheck} />
          <p className="cc-help">Nothing is saved until you confirm.</p>
        </>
      ) : state === "open" ? (
        <>
          {note && <p className="err">{note}</p>}
          {secret ?? (
            <div className="cc-acts">
              <button className={`btn sm ${danger ? "danger" : "primary"}`} type="button" onClick={() => onConfirm()}>{look.confirm ?? "Add it"}</button>
              <button className="cc-quiet" type="button" onClick={onEdit}>Edit</button>
              <button className="cc-quiet" type="button" onClick={onCancel}>Cancel</button>
            </div>
          )}
          <p className="cc-help">Nothing is saved until you confirm.</p>
        </>
      ) : state === "expired" ? (
        <p className="muted cc-help"><span className="chip">Expired</span> Ask again to make a fresh request.</p>
      ) : <p className={state === "error" ? "err" : "muted"}>{state === "working" ? "Working on it…" : note}</p>}
      {after}
    </div>
  );
}
