"use client";

import { openChat, type PinRef } from "@amax/ui";

/**
 * 081 AC-13: "New proposal" in chat's create mode. From a project, the project goes along as the pinned record and in
 * the opening line, so chat doesn't ask which project again.
 */
/** 094 AC-8: `secondary` is "Add by hand", a plain button next to the agent-first line. */
export function NewProposalButton({ project, secondary = false }: { project?: { pin: PinRef; name: string }; secondary?: boolean }) {
  const prompt = project ? `New proposal in ${project.name}` : "New proposal";
  return (
    <button type="button" className={secondary ? "btn" : "btn primary"} data-intent="delivery.new-proposal" title="Add with amax" onClick={() => openChat({ intent: "delivery.new-proposal", pin: project?.pin, prompt })}>
      <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 16, height: 16, fill: "currentColor", stroke: "none" }}><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z" /></svg>
      {secondary ? "Add by hand" : "New proposal"}
    </button>
  );
}
