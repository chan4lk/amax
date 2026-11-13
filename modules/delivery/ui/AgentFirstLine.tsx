"use client";

import type { MouseEvent } from "react";

/**
 * 093 AC-1, 094 AC-8: where agent-first proposals come from: one project's repo, or "your repos" across projects.
 * 104 AC-14 (amendment 1): an info icon rather than a line of text, opening with what the page is (`intro`, the lede it
 * replaces) and then, step by step, how a change gets here.
 *
 * Review round 1 (WCAG 1.4.13): a native popover, so a click, a tap or Enter opens it and Escape or a click outside
 * closes it. Hovering the icon opens it too, and it stays while the pointer is on the icon or the popover (a bridge
 * covers the gap); moving away closes only what hover opened. No hooks, so it renders anywhere.
 */
const place = (btn: Element, tip: HTMLElement) => {
  const r = btn.getBoundingClientRect();
  tip.style.top = `${r.bottom}px`;
  tip.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8))}px`;
};
const parts = (e: MouseEvent<HTMLElement>) => {
  const box = e.currentTarget.closest(".dv-info")!;
  return { btn: box.querySelector("button")!, tip: box.querySelector<HTMLElement>("[popover]")! };
};
const isOpen = (tip: HTMLElement) => tip.matches(":popover-open");

function hoverIn(e: MouseEvent<HTMLElement>) {
  const { btn, tip } = parts(e);
  if (isOpen(tip)) return;
  tip.dataset.hover = "1";
  tip.showPopover();
  place(btn, tip);
}
function hoverOut(e: MouseEvent<HTMLElement>) {
  const { tip } = parts(e);
  if (tip.dataset.hover && isOpen(tip)) tip.hidePopover();
  delete tip.dataset.hover;
}
function clicked(e: MouseEvent<HTMLButtonElement>) {
  const { btn, tip } = parts(e);
  // Opened by hover: a click keeps it open (it now stays until Escape or a click outside) rather than closing it.
  if (tip.dataset.hover && isOpen(tip)) { delete tip.dataset.hover; e.preventDefault(); return; }
  requestAnimationFrame(() => { if (isOpen(tip)) place(btn, tip); });
}

export function AgentFirstLine({ repoUrl, intro }: { repoUrl?: string; intro?: string }) {
  // One icon per page (or per project on a list), so the repo names the popover.
  const id = `dv-tip-${(repoUrl ?? "all").replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <span className="dv-info" onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
      <button type="button" className="dv-info-btn" aria-label="About proposals and how to add one" aria-describedby={id} popoverTarget={id} onClick={clicked}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" strokeWidth="1.5" /><path d="M8 7v4.5M8 4.5v.5" fill="none" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
      <div popover="auto" role="tooltip" id={id} className="dv-tip">
        {intro && <p>{intro}</p>}
        <p>Proposals come from {repoUrl ?? "your repos"}; nothing is typed in here. To add one:</p>
        <ol>
          <li>In the repo, write it with <code>/specclaw:propose</code>.</li>
          <li>Sync the repo to amax: run <code>/amax:sync-specclaw</code> there, or merge the change and CI syncs it.</li>
        </ol>
      </div>
    </span>
  );
}
