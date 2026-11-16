"use client";

import type { ChangeEvent, KeyboardEvent } from "react";

/**
 * 081 AC-16: search proposals by key or title. Read-only: Enter opens the list with `q`, keeping the other filters.
 * Emptying the box (its ✕, or deleting the text) while a search is on goes back to the unsearched list. As you type,
 * the box completes the text in place from the filtered proposals (a key first, then a title), with the guessed part
 * selected: typing on or Backspace drops it, Tab or → keeps it, Enter searches what the box holds.
 */
export function ProposalSearch({ base, project, q, owner, need, options = [] }: { base: string; project?: string; q?: string; owner?: string; need?: string; options?: { key: string; title: string }[] }) {
  const go = (value: string) => {
    const s = new URLSearchParams(Object.entries({ project, q: value.trim(), owner, need }).filter(([, x]) => x) as [string, string][]).toString();
    window.location.assign(`${base}${s ? `?${s}` : ""}`);
  };
  const complete = (typed: string) => {
    const t = typed.toLowerCase();
    const hit = options.find((o) => o.key.toLowerCase().startsWith(t))?.key ?? options.find((o) => o.title.toLowerCase().startsWith(t))?.title;
    return hit && hit.length > typed.length ? typed + hit.slice(typed.length) : null;
  };
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const box = e.currentTarget;
    if (q && !box.value.trim()) return go("");
    const native = e.nativeEvent as InputEvent;
    // Only complete at the end of fresh typing: not while deleting, composing (IME), or editing mid-text.
    if (native.isComposing || native.inputType?.startsWith("delete") || box.selectionStart !== box.value.length || !box.value.trim()) return;
    const typed = box.value, full = complete(typed);
    if (full) { box.value = full; box.setSelectionRange(typed.length, full.length); }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const box = e.currentTarget;
    const guessed = box.selectionStart !== box.selectionEnd && box.selectionEnd === box.value.length;
    if (e.key === "Enter") go(box.value);
    else if ((e.key === "Tab" || e.key === "ArrowRight") && guessed && !e.shiftKey) { e.preventDefault(); box.setSelectionRange(box.value.length, box.value.length); }
  };
  return (
    <span role="search" className="proposal-search">
      <input type="search" defaultValue={q ?? ""} placeholder="Search proposals" aria-label="Search proposals by key or title, then press Enter"
        aria-autocomplete={options.length ? "inline" : undefined} autoComplete="off" onKeyDown={onKeyDown} onChange={onChange} />
    </span>
  );
}
