import type { ChangeRequest } from "../server/requests-read";
import { AskButton } from "./AskButton";
import { Change, Steps, Thread } from "./RequestParts";
import { RequestFold } from "./RequestFold";
import { answerPrompt, quickReplies, requestPin, stateOf, withdrawPrompt } from "./request-view";

/** 073: one change request on the owner's My timesheet: where it stands, the approver's question, and one-click replies. */
export function MyRequest({ r, open }: { r: ChangeRequest; open: boolean }) {
  const pin = requestPin(r);
  const active = r.status === "pending" || r.status === "needs_info";
  const replies = r.status === "needs_info" ? quickReplies(r.question) : [];
  return (
    <section className="card notice rq" aria-label={`Change request, ${r.before.projectName}, ${r.dayLabel}`}>
      <RequestFold r={r} chip={stateOf(r)} title={<b>{r.before.projectName} · {r.dayLabel}</b>} open={open}>
        <Change r={r} reasonLabel="Your reason" />
        <Thread r={r} asker={`${r.deciderName ?? "Your approver"} asks`} answerer="You answered" />
        {active && (
          <div className="rq-actions">
            {replies.map((a) => <AskButton key={a} className="btn sm" spark={false} label={a} name={`Answer: ${a}`} prompt={answerPrompt(r, a)} pin={pin} />)}
            {r.status === "needs_info" && <AskButton className="btn sm primary" label="Answer in chat" prompt={answerPrompt(r)} pin={pin} />}
            <AskButton className="btn sm link" spark={false} label="Withdraw request" prompt={withdrawPrompt(r)} pin={pin} />
          </div>
        )}
        <Steps r={r} />
      </RequestFold>
    </section>
  );
}
