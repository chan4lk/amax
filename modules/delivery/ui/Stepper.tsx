import { facet, PinButton, type PinRef } from "@amax/ui";
import { stepsOf } from "./band";
import { day, PHASE_UI } from "./parts";

// 081 amendment 4 (AC-47): where the proposal is in its life, as five steps. It replaces the phase chip the header
// had, so the phase is said once. Each step's state is a shape and a word, never colour alone.
const WORD = { done: "Done", current: "Now", todo: "Not yet", withdrawn: "Withdrawn" } as const;
const SHAPE = {
  done: <path d="M3.5 8.5l3 3 6-7" fill="none" strokeWidth="2.2" />,
  current: <circle cx="8" cy="8" r="4.2" />,
  todo: <circle cx="8" cy="8" r="4.6" fill="none" strokeWidth="1.8" />,
  withdrawn: <path d="M4 4l8 8M12 4l-8 8" fill="none" strokeWidth="2.2" />,
};

type Props = { pin: PinRef; p: Parameters<typeof stepsOf>[0] & { key: string } };

export function Stepper({ pin, p }: Props) {
  const steps = stepsOf(p);
  const now = steps.find((s) => s.state === "current" || s.state === "withdrawn") ?? steps.at(-1)!;
  return (
    <div className="card pinnable dv-steps-card">
      <PinButton pin={facet(pin, " stage")} />
      <ol className="dv-steps" aria-label={`${p.key} stage: ${PHASE_UI[now.phase].label}${now.state === "withdrawn" ? ", withdrawn" : ""}`}>
        {steps.map((s) => (
          <li key={s.phase} className={s.state} aria-current={s.state === "current" ? "step" : undefined}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">{SHAPE[s.state]}</svg>
            <b>{PHASE_UI[s.phase].label}</b>
            <small>{s.state === "done" && s.at ? day(s.at) : s.state === "current" && s.at ? `since ${day(s.at)}` : WORD[s.state]}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
