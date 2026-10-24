import { changeText, type ChangeRequest } from "../server/requests-read";
import { steps } from "./request-view";
import "./request.css";

// 073: the parts both change-request cards share (the owner's on My timesheet, the reviewer's on Team time).
const h = (n: number) => `${Number(n.toFixed(2))} h`;
export const firstName = (name: string | null) => (name ?? "Your approver").split(" ")[0];

/** The change at a glance: hours as before → after, a removal as "→ removed", anything else in words, and the reason. */
export function Change({ r, reasonLabel }: { r: ChangeRequest; reasonLabel: string }) {
  const hours = r.kind === "delete" ? "removed" : r.proposed.hours !== undefined && r.proposed.hours !== r.before.hours ? h(r.proposed.hours) : null;
  const rest = changeText(r).filter((t) => !t.startsWith("Hours ") && !t.startsWith("Remove "));
  return (
    <div className="rq-change">
      {hours && <p className="rq-hours" aria-label={`${h(r.before.hours)} to ${hours}`}><span>{h(r.before.hours)}</span><b aria-hidden="true">→</b><span className="to">{hours}</span></p>}
      {rest.length > 0 && <ul className="rq-other">{rest.map((t) => <li key={t}>{t}</li>)}</ul>}
      <p className="rq-reason"><span className="muted">{reasonLabel}</span> “{r.reason}”</p>
    </div>
  );
}

/** The exchange: the reviewer's question, the owner's answer, and the decision note once decided. */
export function Thread({ r, asker, answerer, highlightAnswer }: { r: ChangeRequest; asker: string; answerer: string; highlightAnswer?: boolean }) {
  const open = r.status === "pending" || r.status === "needs_info";
  return (
    <>
      {r.question && <blockquote className={`rq-say${r.status === "needs_info" && !highlightAnswer ? " ask" : ""}`}><cite>{asker}</cite><p>{r.question}</p></blockquote>}
      {r.answer && <blockquote className={`rq-say ${highlightAnswer ? "reply" : "me"}`}><cite>{answerer}</cite><p>{r.answer}</p></blockquote>}
      {!open && r.decisionNote && <blockquote className="rq-say"><cite>{firstName(r.deciderName)}{r.status === "declined" ? " declined" : ""}</cite><p>{r.decisionNote}</p></blockquote>}
    </>
  );
}

export function Steps({ r }: { r: ChangeRequest }) {
  return (
    <ol className="rq-steps" aria-label="Progress">
      {steps(r).map((s) => <li key={s.label} className={s.state} aria-current={s.state === "now" ? "step" : undefined}>{s.label}</li>)}
    </ol>
  );
}
