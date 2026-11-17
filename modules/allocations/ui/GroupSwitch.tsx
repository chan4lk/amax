"use client";

import type { Group } from "./types";

const OPTIONS: { group: Group; label: string }[] = [{ group: "mine", label: "My projects" }, { group: "all", label: "Everyone" }];

function addressFor(group: Group) {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/\/everyone$/, "");
  if (group === "all") url.searchParams.set("view", "everyone");
  else url.searchParams.delete("view");
  return url.pathname + url.search;
}

export function GroupSwitch({ group, onChange }: { group: Group; onChange: (g: Group) => void }) {
  return (
    <div className="ad-switch" role="group" aria-label="Whose projects to show">
      {OPTIONS.map((o) => (
        <button key={o.group} type="button" aria-pressed={group === o.group} onClick={() => { window.history.replaceState(null, "", addressFor(o.group)); onChange(o.group); }}>{o.label}</button>
      ))}
    </div>
  );
}
