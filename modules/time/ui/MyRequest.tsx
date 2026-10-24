import { PinButton } from "@amax/ui";
import { changeText, type ChangeRequest } from "../server/requests-read";
import { AskButton } from "./AskButton";
import { Since } from "./Since";
import { answerPrompt, quickReplies, requestPin, stateOf, steps, withdrawPrompt } from "./request-view";
import "./request.css";

const h = (n: number) => `${Number(n.toFixed(2))} h`;
const first = (name: string | null) => (name ?? "Your approver").split(" ")[0];

/** The change at a glance: hours as before → after, a removal as "→ removed", anything else in words. */
function Change({ r }: { r: ChangeRequest }) {
  const hours = r.kind === "delete" ? "removed" : r.proposed.hours !== undefined && r.proposed.hours !== r.before.hours ? h(r.proposed.hours) : null;
  const rest = changeText(r).filter((t) => !t.startsWith("Hours ") && !t.startsWith("Remove "));
  return (
    <div className="rq-change">
      {hours && <p className="rq-hours" aria-label={`${h(r.before.hours)} to ${hours}`}><span>{h(r.before.hours)}</span><b aria-hidden="true">→</b><span className="to">{hours}</span></p>}
      {rest.length > 0 && <ul className="rq-other">{rest.map((t) => <li key={t}>{t}</li>)}</ul>}
      <p className="rq-reason"><span className="muted">Your reason</span> “{r.reason}”</p>
    </div>
  );
}

/** 073: one change request on the owner's My timesheet: where it stands, the approver's question, and one-click replies. */
export function MyRequest({ r }: { r: ChangeRequest }) {
  const [chip, words] = stateOf(r);
  const pin = requestPin(r);
  const open = r.status === "pending" || r.status === "needs_info";
  const replies = r.status === "needs_info" ? quickReplies(r.question) : [];
  return (
    <section className="card pinnable notice rq" aria-label={`Change request, ${r.before.projectName}, ${r.dayLabel}`}>
      <div className="rq-top"><span className={`chip ${chip}`}>{words}</span><small className="muted">asked <Since at={r.createdAt} /></small></div>
      <div className="card-head"><h2>{r.before.projectName} · {r.dayLabel}</h2><PinButton inline pin={pin} /></div>
      <Change r={r} />
      {r.question && (
        <blockquote className={`rq-say${r.status === "needs_info" ? " ask" : ""}`}><cite>{r.deciderName ?? "Your approver"} asks</cite><p>{r.question}</p></blockquote>
      )}
      {r.answer && <blockquote className="rq-say me"><cite>You answered</cite><p>{r.answer}</p></blockquote>}
      {!open && r.decisionNote && <blockquote className="rq-say"><cite>{first(r.deciderName)}{r.status === "declined" ? " declined" : ""}</cite><p>{r.decisionNote}</p></blockquote>}
      {open && (
        <div className="rq-actions">
          {replies.map((a) => <AskButton key={a} className="btn sm" spark={false} label={a} name={`Answer: ${a}`} prompt={answerPrompt(r, a)} pin={pin} />)}
          {r.status === "needs_info" && <AskButton className="btn sm primary" label="Answer in chat" prompt={answerPrompt(r)} pin={pin} />}
          <AskButton className="btn sm link" spark={false} label="Withdraw request" prompt={withdrawPrompt(r)} pin={pin} />
        </div>
      )}
      <ol className="rq-steps" aria-label="Progress">
        {steps(r).map((s) => <li key={s.label} className={s.state} aria-current={s.state === "now" ? "step" : undefined}>{s.label}</li>)}
      </ol>
    </section>
  );
}
