import { PinButton } from "@amax/ui";
import type { MyWeek } from "../server/my";
import { AskButton } from "./AskButton";
import { Since } from "./Since";
import "./request.css";

/**
 * 073: a sent-back week on My timesheet, as a card instead of one long line: what happened and what to do, the
 * approver's note in their words, and the next step as chat prompts (fix with amax, or resubmit as it is).
 */
export function SentBack({ m }: { m: MyWeek }) {
  const pin = { label: `My timesheet ${m.key}`, tool: "get_my_week", args: { week: m.key } };
  const who = m.rejectedBy ?? "Your approver";
  return (
    <section className="card notice rq sent-back pinnable" aria-label={`${m.key} was sent back`}>
      {/* 073 review round 1 (R3): the card shows a record (the sent-back week, who sent it and why), so it is pinnable. */}
      <PinButton inline pin={pin} />
      <div className="rq-top">
        <span className="chip bad">Sent back · fix and resubmit</span>
        {m.rejectedAt && <small className="muted">sent back <Since at={m.rejectedAt} /></small>}
      </div>
      <blockquote className="rq-say ask"><cite>{who} asks</cite><p>{m.rejectComment}</p></blockquote>
      <div className="rq-actions">
        <AskButton className="btn sm primary" label="Fix it with amax" prompt={`Help me fix my timesheet for ${m.key} as ${who.split(" ")[0]} asked: ${m.rejectComment}`} pin={pin} />
        <AskButton className="btn sm" spark={false} label="Resubmit as it is" prompt={`Submit my timesheet for ${m.key} as it is`} pin={pin} />
      </div>
    </section>
  );
}
