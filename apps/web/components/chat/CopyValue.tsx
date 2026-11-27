"use client";
import { useState } from "react";

// 116: copies a card line's value (the GitHub app's callback URL) and says so to screen readers.
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [said, say] = useState("");
  const failed = () => say("Couldn't copy; select the text instead");
  // Review round 1: outside a secure context there is no clipboard; say so rather than throwing.
  const copy = () => (navigator.clipboard?.writeText ? navigator.clipboard.writeText(value).then(() => say("Copied"), failed) : failed());
  return (
    <>
      <button type="button" className="cc-quiet" onClick={copy} aria-label={`Copy ${label}`}>Copy</button>
      <span className="sr" role="status">{said}</span>
    </>
  );
}
