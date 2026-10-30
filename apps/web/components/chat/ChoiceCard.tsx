import { useId, useState, type KeyboardEvent } from "react";
import type { PendingAction } from "@amax/chat";
import { Lines } from "./ConfirmCard";

// 076: one card for a choice between writes. Each option is its own pending card (same checks, same keyed confirm);
// the person picks one, sees exactly what it changes, and confirms it in one step; the server drops the rest.
// Keys: 1–4 pick an option, Enter confirms the picked one. "Something else…" writes nothing.
type State = "open" | "working" | "done" | "error" | "expired" | "cancelled";
export type Option = { action: PendingAction; state: State; note?: string };
type Props = { options: Option[]; onConfirm: (a: PendingAction, answer?: string) => void; onCancel: (a: PendingAction) => void; onElse: () => void };

// What every option shares (the project and day, say) is said once under the question, not on each option.
const where = (a: PendingAction) => [a.look?.subject, a.look?.detail].filter(Boolean).join(" · ");
// "0.7 h → 2.7 h" never breaks inside a figure or around its arrow.
const keep = (t: string) => t.replace(/(\d) h\b/g, "$1 h").replace(/ → /g, " → ");

// The picked option's preview: only the details its label doesn't already say (who it's for, billable, who is told).
const more = (a: PendingAction) => (a.lines ?? []).filter((l) => !keep(a.choice!.label).includes(keep(l.value)));

export function ChoiceCard({ options, onConfirm, onCancel, onElse }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const name = useId();
  const first = options[0].action;
  const done = options.find((o) => o.state === "done");
  if (done) return <Receipt tick="✓" text={done.note ?? `Done: ${done.action.title}.`} title={first.choice!.question} />;
  if (options.every((o) => o.state === "cancelled" || o.state === "expired")) return <Receipt tick="✕" text="Cancelled. Nothing was changed." title={first.choice!.question} cancelled />;
  const open = options.filter((o) => o.state !== "cancelled");
  const working = options.find((o) => o.state === "working");
  const chosen = open.find((o) => o.action.id === picked)?.action;
  const note = open.find((o) => o.note)?.note;
  const shared = open.every((o) => where(o.action) === where(first)) ? where(first) : "";
  const danger = chosen?.look?.tone === "danger";
  // 076 amendment 1: a value every option needs (a reason) is typed here; the server checks it again before anything runs.
  const ask = first.choice!.ask;
  const ready = !!chosen && !working && (!ask || answer.trim().length > 0);
  const confirm = () => ready && onConfirm(chosen!, ask ? answer.trim() : undefined);
  const keys = (e: KeyboardEvent) => {
    const n = Number(e.key);
    if ((e.target as HTMLElement).tagName === "TEXTAREA") {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirm(); }
    } else if (!working && n >= 1 && n <= open.length) { e.preventDefault(); setPicked(open[n - 1].action.id); }
    else if (e.key === "Enter" && (e.target as HTMLInputElement).type === "radio") { e.preventDefault(); confirm(); }
  };
  return (
    <div className={`b cc ch${working ? " busy" : ""}`} role="group" aria-label={`Choose: ${first.choice!.question}`} onKeyDown={keys}>
      <div className="cc-top"><span className="cc-eyebrow">Choose · {first.look?.kind ?? "Change"}</span>{first.look?.who && <span className="cc-who">{first.look.who}</span>}</div>
      <p className="ch-q" id={`${name}-q`}>{first.choice!.question}{shared && <small>{shared}</small>}</p>
      <div className="ch-opts" role="radiogroup" aria-labelledby={`${name}-q`} aria-describedby={`${name}-keys`}>
        {open.map(({ action: a, state }, i) => (
          <div key={a.id} className={`ch-opt${picked === a.id ? " on" : ""}${state === "working" ? " run" : ""}`}>
            <label className="ch-row">
              <input type="radio" name={name} value={a.id} checked={picked === a.id} disabled={!!working} onChange={() => setPicked(a.id)} />
              {a.look?.figure && <span className="ch-num">{a.look.figure}</span>}
              <span className="ch-txt"><b>{keep(a.choice!.label)}</b>{!shared && where(a) && <small>{where(a)}</small>}</span>
              {state === "working" ? <span className="ch-spin" aria-hidden="true" /> : <kbd className="ch-key" aria-hidden="true">{i + 1}</kbd>}
            </label>
            {picked === a.id && more(a).length > 0 && <div className={`ch-more${a.look?.figure ? " num" : ""}`}><Lines lines={more(a)} /></div>}
          </div>
        ))}
      </div>
      {ask && (
        <label className="ch-ask"><span>{ask.label}</span>
          <textarea rows={2} value={answer} maxLength={500} disabled={!!working} onChange={(e) => setAnswer(e.target.value)} aria-required="true" />
        </label>
      )}
      <button className="cc-quiet ch-else" type="button" onClick={onElse} disabled={!!working}>Something else…</button>
      {note && <p className="err">{note}</p>}
      <div className="cc-acts">
        <button className={`btn sm ${danger ? "danger" : "primary"}`} type="button" disabled={!ready} onClick={confirm}>
          {working ? "Saving…" : chosen && ask && !answer.trim() ? "Type your answer" : chosen ? `${chosen.look?.confirm ?? "Confirm"}${chosen.look?.figure ? ` · ${chosen.look.figure}` : ""}` : "Pick an option"}
        </button>
        {!working && <button className="cc-quiet" type="button" onClick={() => onCancel(first)}>Cancel</button>}
      </div>
      <p className="cc-help" id={`${name}-keys`}><span className="ch-hint">Press 1–{open.length} to pick{ask ? ", type your answer" : ""}, Enter to confirm. </span>Nothing is saved until you confirm.</p>
    </div>
  );
}

function Receipt({ tick, text, title, cancelled }: { tick: string; text: string; title: string; cancelled?: boolean }) {
  return <div className={`b cc ${cancelled ? "cancelled" : "done"}`} role="group" aria-label={`Choose: ${title}`}><p className="cc-receipt"><span className="cc-tick" aria-hidden="true">{tick}</span>{text}</p></div>;
}
