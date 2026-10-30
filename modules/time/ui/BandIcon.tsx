// 075: the status band's legend icons, drawn on one 16-unit grid so they share a size and sit centred on their label
// (text glyphs like ● and ✦ render at different sizes and heights from font to font). Colour comes from the chip.
import type { ReactNode } from "react";

const SHAPES: Record<string, ReactNode> = {
  approved: <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" strokeWidth="2" />,
  submitted: <circle cx="8" cy="8" r="4.5" />,
  rejected: <path d="M6 4 2.5 7.5 6 11M2.5 7.5H10a3 3 0 0 1 0 6H8" fill="none" strokeWidth="1.8" />,
  draft: <><circle cx="8" cy="8" r="5" fill="none" strokeWidth="1.6" /><path d="M8 3a5 5 0 0 1 0 10z" /></>,
  not_started: <circle cx="8" cy="8" r="5" fill="none" strokeWidth="1.6" />,
  agent: <path d="M8 1.5 9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4z" />,
  people: <circle cx="8" cy="8" r="4.5" />,
};

export function BandIcon({ kind }: { kind: string }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">{SHAPES[kind]}</svg>;
}
