"use client";

import { openChat, type PinRef } from "@amax/ui";

export function FixChip({ pin, prompt, name }: { pin: PinRef; prompt: string; name: string }) {
  return (
    <button type="button" className="ad-ofix" aria-label={name} title={name} onClick={() => openChat({ pin, prompt })}>
      <span className="ad-bot" aria-hidden="true" />
      <span className="ad-fxt">Fix</span>
    </button>
  );
}
