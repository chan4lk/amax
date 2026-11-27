"use client";

import Link from "next/link";
import { useState } from "react";
import type { OverviewWaiting } from "@amax/core";
import { openChat, PinButton } from "@amax/ui";
import { useSnoozed } from "./useSnoozed";

const waited = (since: string, now: number) => {
  const h = Math.max(0, Math.round((now - new Date(since).getTime()) / 3_600_000));
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`;
};

const SHOWN = 6;

// 068 AC-3: decisions waiting on the viewer, oldest first. Every action opens chat with the record
// pinned and a prompt filled in; chat runs any write after the pending-action confirm (rule 1).
export function WaitingTable({ items: given, now, viewerId }: { items: OverviewWaiting[]; now: number; viewerId: string }) {
  const { hidden, snooze } = useSnoozed(viewerId);
  const all = given.filter((i) => !hidden(i.id));
  const items = all.slice(0, SHOWN);
  const [picked, setPicked] = useState<string[]>([]);
  // 116 final pass: a nudge isn't a decision, so it is never selected or approved in bulk.
  const decisions = items.filter((i) => !i.snoozeDays);
  const chosen = decisions.filter((i) => picked.includes(i.id));
  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  const ask = (rows: OverviewWaiting[], prompt: string) => { for (const r of rows) openChat({ pin: r.pin }); openChat({ prompt }); };
  return (
    <div className="card flush waiting">
      <div className="card-head"><h2>Waiting on you</h2><div className="actions">
        <button type="button" className="btn primary" disabled={!chosen.length} onClick={() => ask(chosen, `Approve these ${chosen.length} decisions`)}>Approve selected</button>
      </div></div>
      {items.length ? (
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th className="sel"><input type="checkbox" aria-label="Select all decisions" checked={decisions.length > 0 && chosen.length === decisions.length} onChange={(e) => setPicked(e.target.checked ? decisions.map((i) => i.id) : [])} /></th><th>Decision</th><th>Project</th><th>Raised by</th><th>Waiting</th><th className="num">Action</th></tr></thead>
          <tbody>{items.map((i) => (
            <tr key={i.id} className="pinnable">
              <td className="sel">{!i.snoozeDays && <input type="checkbox" aria-label={`Select: ${i.title}`} checked={picked.includes(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />}</td>
              <td><b>{i.title}</b>{i.detail && <small>{i.detail}</small>}</td>
              <td>{i.context}</td>
              <td><span className={i.agent ? "chip agent" : "chip"}>{i.raisedBy}</span></td>
              <td>{i.snoozeDays ? "New" : <time dateTime={i.since}>{waited(i.since, now)}</time>}</td>
              <td className="num"><span className="when"><button type="button" className="btn sm" title="Ask amax" onClick={() => ask([i], i.prompt)}>{i.action}</button>{i.snoozeDays && <button type="button" className="btn sm" onClick={() => snooze(i.id, i.snoozeDays!)}>Not now<span className="sr"> ({i.snoozeDays} days): {i.title}</span></button>}<PinButton pin={i.pin} /></span></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="muted empty-line">Nothing is waiting on you.</p>}
      {all.length > SHOWN && <p className="muted empty-line">Oldest {SHOWN} of {all.length} shown. Ask amax for the rest, or open <Link href="/suggestions">Suggestions</Link>.</p>}
    </div>
  );
}
