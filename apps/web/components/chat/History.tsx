"use client";

import { useRef, useState } from "react";
import { announce, PinButton } from "@amax/ui";
import type { ConversationSummary } from "@amax/chat";
import { listChats } from "../../app/actions/chat-history";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function when(at: string, now = new Date()) {
  const d = new Date(at);
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days === 0) return `Today ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function Row({ item, onOpen }: { item: ConversationSummary; onOpen: (id: string) => void }) {
  return (
    <li className="h-row pinnable">
      <button type="button" className="h-open" onClick={() => onOpen(item.id)}>
        <b>{item.title}</b>
        <small className="muted">
          {when(item.updatedAt)} · {plural(item.messageCount, "message")}{item.pinCount > 0 && ` · ${plural(item.pinCount, "pin")}`}
          {item.expiredCount > 0 && <> · <span className="chip warn">{plural(item.expiredCount, "expired action")}</span></>}
        </small>
      </button>
      <PinButton inline pin={{ label: item.title, tool: "get_conversation", args: { id: item.id } }} />
    </li>
  );
}

export function History({ initial, error, onOpen, onNew, as }: { initial: ConversationSummary[]; error?: string; onOpen: (id: string) => void; onNew: () => void; as?: string }) {
  const [items, setItems] = useState(initial);
  const [problem, setProblem] = useState(error);
  const [query, setQuery] = useState("");
  const latest = useRef("");

  async function search(q: string) {
    setQuery(q);
    latest.current = q;
    const r = await listChats(q, as);
    if (latest.current !== q) return;
    if (!r.ok) { setProblem(r.error); return; }
    setProblem(undefined);
    setItems(r.items);
    announce(r.items.length ? `${plural(r.items.length, "chat")} found` : "No chats found");
  }

  return (
    <section className="c-history" aria-labelledby="historyTitle">
      <div className="h-head"><h2 id="historyTitle">History</h2><button type="button" className="btn sm" onClick={onNew}>✦ New chat</button></div>
      <input type="search" className="h-search" value={query} onChange={(e) => search(e.target.value)} placeholder="Search your chats" aria-label="Search your chats" autoFocus />
      {problem && <p className="err" role="alert">{problem}</p>}
      {!problem && items.length === 0 && <p className="muted">{query ? "No chats match that search." : "No past chats yet. Ask amax anything to start one."}</p>}
      <ul className="h-list" aria-label="Your chats">
        {items.map((item) => <Row key={item.id} item={item} onOpen={onOpen} />)}
      </ul>
    </section>
  );
}
