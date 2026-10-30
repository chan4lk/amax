"use client";

import { useRef, useState } from "react";

/** 073: opens or closes every change request in its card at once (each is a <details>, so one opens on its own too). */
export function ExpandAll({ label }: { label: string }) {
  const [all, setAll] = useState(false);
  const me = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    const box = me.current?.closest(".card, .rq-group");
    box?.querySelectorAll<HTMLDetailsElement>("details.rq-fold").forEach((d) => { d.open = !all; });
    setAll(!all);
  };
  return <button ref={me} type="button" className="btn sm link rq-all" aria-label={`${all ? "Collapse" : "Expand"} all ${label}`} onClick={toggle}>{all ? "Collapse all" : "Expand all"}</button>;
}
