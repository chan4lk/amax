import { PinButton } from "@amax/ui";
import type { ChangeRequest } from "../server/requests-read";
import { AskButton } from "./AskButton";
import { Since } from "./Since";
import { Change, firstName, Steps, Thread } from "./RequestParts";
import { decidePromptFor, requestPin, reviewStateOf } from "./request-view";
import { avatar, initials, STATUS } from "./parts";

/**
 * 073: one change request on Team time, as its reviewer sees it: where it stands, the change, the question and the
 * person's answer, and the decisions as chat prompts naming the request by id (each still a confirm card).
 */
export function ReviewRequest({ r, viewerId }: { r: ChangeRequest; viewerId: string }) {
  const [chip, words] = reviewStateOf(r);
  const pin = requestPin(r);
  const who = firstName(r.personName);
  const mine = r.decidedBy?.startsWith(`user:${viewerId}`) ?? false;
  const week = STATUS[r.weekStatus as keyof typeof STATUS];
  const decide = (label: string, decision: "apply" | "ask" | "decline" | "reopen", cls = "btn sm") => (
    <AskButton className={cls} spark={decision === "apply"} label={label} name={`${label}: ${r.personName}, ${r.before.projectName}, ${r.dayLabel}`} prompt={decidePromptFor(r, decision)} pin={pin} />
  );
  return (
    <li className="rq rq-review pinnable" aria-label={`${r.personName}'s change request, ${r.before.projectName}, ${r.dayLabel}`}>
      <div className="rq-top"><span className={`chip ${chip}`}>{words}</span><small className="muted">asked <Since at={r.createdAt} /></small></div>
      <div className="rq-who">
        <span className={`av sm ${avatar(r.personName)}`}>{initials(r.personName)}</span>
        <div><b>{r.personName}</b><small>{r.before.projectName} · {r.dayLabel} · {r.week}{week && <> <span className={`chip ${week[0]}`}>{week[1]}</span></>}</small></div>
        <PinButton inline pin={pin} />
      </div>
      <Change r={r} reasonLabel={`${who}'s reason`} />
      <Thread r={r} asker={mine ? "You asked" : `${firstName(r.deciderName)} asked`} answerer={`${who} answered`} highlightAnswer />
      {r.status === "pending" ? (
        <div className="rq-actions">
          {decide("Apply change", "apply", "btn sm primary")}
          {decide("Ask a question", "ask")}
          {decide("Decline", "decline")}
          {decide("Reopen week", "reopen", "btn sm link")}
        </div>
      ) : <p className="rq-wait muted">Waiting for {who} to answer. You'll hear when they do.</p>}
      <Steps r={r} />
    </li>
  );
}
