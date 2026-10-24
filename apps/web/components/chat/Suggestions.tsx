"use client";

import type { PageSuggestion } from "../../lib/page-context";

// 070 amendment 4: what chat can do on this page. Choosing one fills the message box; it never sends.
export const ASK_HERE: PageSuggestion = { label: "What can you help me do here?", prompt: "What can you help me do here?" };

export function Suggestions({ items, onPick }: { items: PageSuggestion[]; onPick: (prompt: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="c-suggest" aria-label="Suggestions for this page">
      {[...items, ASK_HERE].map((s) => (
        <li key={s.label}><button type="button" className="chip" onClick={() => onPick(s.prompt)}>{s.label}</button></li>
      ))}
    </ul>
  );
}
