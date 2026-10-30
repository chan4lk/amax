import type { ChangeRequest } from "../server/requests-read";
import { AskButton } from "./AskButton";
import { Change, firstName, Steps, Thread } from "./RequestParts";
import { RequestFold } from "./RequestFold";
import { decidePromptFor, requestPin, reviewStateOf } from "./request-view";
import { avatar, initials, STATUS } from "./parts";

/**
 * 073: one change request on Team time, as its reviewer sees it: where it stands, the change, the question and the
 * person's answer, and the decisions as chat prompts naming the request by id (each still a confirm card). Folds to one row.
 */
export function ReviewRequest({ r, viewerId, open }: { r: ChangeRequest; viewerId: string; open: boolean }) {
  const pin = requestPin(r);
  const who = firstName(r.personName);
  const mine = r.decidedBy?.startsWith(`user:${viewerId}`) ?? false;
  const week = STATUS[r.weekStatus as keyof typeof STATUS];
  const decide = (label: string, decision: "apply" | "ask" | "decline" | "reopen", cls = "btn sm") => (
    <AskButton className={cls} spark={decision === "apply"} label={label} name={`${label}: ${r.personName}, ${r.before.projectName}, ${r.dayLabel}`} prompt={decidePromptFor(r, decision)} pin={pin} />
  );
  const title = (
    <span className="rq-who">
      <span className={`av sm ${avatar(r.personName)}`}>{initials(r.personName)}</span>
      <span><b>{r.personName}</b><small>{r.before.projectName} · {r.dayLabel} · {r.week}{week && <> <span className={`chip ${week[0]}`}>{week[1]}</span></>}</small></span>
    </span>
  );
  return (
    <li className="rq rq-review" aria-label={`${r.personName}'s change request, ${r.before.projectName}, ${r.dayLabel}`}>
      <RequestFold r={r} chip={reviewStateOf(r)} title={title} open={open}>
        <Change r={r} reasonLabel={`${who}'s reason`} />
        <Thread r={r} asker={mine ? "You asked" : `${firstName(r.deciderName)} asked`} answerer={`${who} answered`} highlightAnswer />
        {r.status === "pending" ? (
          <div className="rq-actions">
            {decide("Apply change", "apply", "btn sm primary")}
            {decide("Ask a question", "ask")}
            {decide("Decline", "decline")}
            {decide("Reopen week", "reopen", "btn sm link")}
          </div>
        ) : r.status === "needs_info" ? <p className="rq-wait muted">Waiting for {who} to answer. You'll hear when they do.</p> : null}
        <Steps r={r} />
      </RequestFold>
    </li>
  );
}
