"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { usePathname, useRouter } from "next/navigation";
import { announce, Mascot, PinButton, type PinRef } from "@amax/ui";
import type { Conversation, ConversationSummary, Highlight, PendingAction } from "@amax/chat";
import { cancelChat, confirmChat, pageContext, refreshPins, sendChat, type CardOutcome } from "../../app/actions/chat";
import type { PageInfo } from "../../lib/page-context";
import { pinKey, withFresh, type Pin } from "@amax/chat/pins";
import { followMove } from "../../lib/chat-move";
import { listChats, openChat } from "../../app/actions/chat-history";
import { History } from "./History";
import { SecretConfirm } from "./SecretConfirm";
import { RevealOnce } from "./RevealOnce";
import { Suggestions } from "./Suggestions";

type Entry =
  | { kind: "me"; text: string; highlights: Highlight[] }
  | { kind: "amax"; text: string; tools: string[]; error?: boolean }
  | { kind: "confirm"; action: PendingAction; state: CardOutcome["state"] | "working" | "expired"; note?: string; reveal?: CardOutcome["reveal"] };

const restoredLog = (c: Conversation): Entry[] => [
  ...c.messages.map((m): Entry => (m.role === "me" ? { kind: "me", text: m.text, highlights: [] } : { kind: "amax", text: m.text, tools: [] })),
  ...c.pending.map((p): Entry => ({ kind: "confirm", action: p, state: p.expired ? "expired" : "open" })),
];

const FIELD_CLASSES = ["f-client", "f-value", "f-dates", "f-person", "f-stage", "f-name"];
const fieldClass = (fields: string[], field: string) => FIELD_CLASSES[Math.max(0, fields.indexOf(field)) % FIELD_CLASSES.length];

function Marked({ text, highlights, fields }: { text: string; highlights: Highlight[]; fields: string[] }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const h of highlights) {
    if (h.index < at) continue;
    parts.push(text.slice(at, h.index));
    parts.push(<mark key={h.index} className={`x ${fieldClass(fields, h.field)}`} title={h.field}>{h.text}</mark>);
    at = h.index + h.text.length;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

// The model writes light markdown; render **bold**, `code`, line breaks and "- " lists as React
// elements (never HTML), so model text can't inject markup.
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <b key={`${key}-${i}`}>{part.slice(2, -2)}</b>
      : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? <code key={`${key}-${i}`}>{part.slice(1, -1)}</code> : part);
}
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={`ul${blocks.length}`} style={{ margin: "6px 0", paddingLeft: 18 }}>{list}</ul>); list = []; } };
  text.split("\n").forEach((line, i) => {
    const item = line.match(/^\s*[-*•]\s+(.*)$/);
    if (item) { list.push(<li key={i}>{inline(item[1], `l${i}`)}</li>); return; }
    flush();
    if (line.trim()) blocks.push(<p key={i} style={{ margin: "0 0 6px" }}>{inline(line, `p${i}`)}</p>);
  });
  flush();
  return <>{blocks}</>;
}

type SpeechCtor = new () => { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; start: () => void; stop: () => void };

export function Chat({ open, fresh = 0, onClose, returnFocus, signedIn, userId, voice, usage = null }: { open: boolean; fresh?: number; onClose: () => void; returnFocus: RefObject<HTMLButtonElement | null>; signedIn: boolean; userId?: string; voice: boolean; usage?: string | null }) {
  const [log, setLog] = useState<Entry[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<string | undefined>();
  const [picking, setPicking] = useState(false);
  const [talking, setTalking] = useState(false);
  const [turnUsage, setTurnUsage] = useState<string | null>(null);
  const [history, setHistory] = useState<{ items: ConversationSummary[]; error?: string } | null>(null);
  // 070 amendment 4: the page chat is open on, read again after each turn so suggestions follow the record's state.
  const pathname = usePathname();
  const [page, setPage] = useState<PageInfo | null>(null);
  const convo = useRef<string | undefined>(undefined);
  const input = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fields = useRef<string[]>([]);
  // A prompt an Ask amax chip filled, until the person edits it (059 AC-7): what they type finishes it.
  const filled = useRef<string | null>(null);
  // The pin that came with that prompt, and whether the prompt added it (rather than it being pinned already).
  const asked = useRef<{ key: string; added: boolean } | null>(null);
  const textNow = useRef(text);
  // Opened from Ask amax or the shortcut (not a pin): a new conversation with nothing pinned and no leftover prompt.
  // What the person typed themselves stays; the last conversation is in History.
  const freshSeen = useRef(fresh);
  useEffect(() => {
    if (fresh === freshSeen.current) return;
    freshSeen.current = fresh;
    if (busy) return;
    convo.current = undefined;
    setLog([]);
    setPins([]);
    setIntent(undefined);
    setHistory(null);
    asked.current = null;
    if (filled.current !== null && filled.current === textNow.current) { filled.current = null; setText(""); }
  }, [fresh, busy]);
  textNow.current = text;
  const pinsNow = useRef(pins);
  pinsNow.current = pins;
  const pinsKey = pins.map(pinKey).join("|");

  // Chat is fixed to the screen, so focusing in or out of it never needs to scroll the page under it.
  useEffect(() => { if (open) input.current?.focus({ preventScroll: true }); }, [open]);
  // The caret goes to the end of a filled prompt in the same commit that shows it, so nothing can see
  // the prompt with the caret elsewhere, and no later frame moves a caret the person already placed.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el || filled.current === null || filled.current !== text) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(text.length, text.length);
  }, [text]);
  // Focus can leave and come back before the first key (the route focus after chat follows a record,
  // then a programmatic focus that puts the caret at 0): while the prompt is untouched, the first key
  // still lands at its end. A selection (select all, then type) is left alone, so it replaces the prompt.
  const toEnd = (el: HTMLTextAreaElement) => {
    if (filled.current === null || el.value !== filled.current || el.selectionStart !== el.selectionEnd) return;
    el.setSelectionRange(el.value.length, el.value.length);
  };
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [log, busy]);
  // The message box grows with what is typed (up to about six lines, then it scrolls), so a long request reads in full.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text, open]);
  useEffect(() => {
    if (!open || !signedIn) return;
    let live = true;
    // 073: what is pinned shapes the suggestions too (a pinned week offers its approve or remind).
    const pinned = pinsNow.current.filter((x) => !x.unavailable).map(({ tool, args }) => ({ tool, args }));
    pageContext(pathname, userId, pinned).then((p) => { if (live) setPage(p); }, () => { if (live) setPage(null); });
    return () => { live = false; };
  }, [open, signedIn, pathname, log.length, userId, pinsKey]);

  // Pins and intents arrive from anywhere on the page.
  useEffect(() => {
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<{ pin?: PinRef; intent?: string; prompt?: string }>).detail;
      const key = d.pin ? pinKey(d.pin) : undefined;
      // An untouched Ask amax prompt belongs to the record it pinned. A pin or prompt for another record
      // replaces both, so the agent never gets the last row's pin with this row's question.
      const ask = asked.current;
      const untouched = ask !== null && filled.current !== null && filled.current === textNow.current;
      if (ask && untouched && ask.key !== key) {
        if (ask.added) setPins((p) => p.filter((x) => pinKey(x) !== ask.key));
        if (!d.prompt && !d.intent) { filled.current = null; setText(""); }
        asked.current = null;
      } else if (untouched && !d.prompt && !d.intent) {
        // A bare pin (the row's +) on the record the prompt came with keeps the pin and drops the prompt.
        filled.current = null; setText(""); asked.current = null;
      }
      const added = ask && ask.key === key ? ask.added : !pinsNow.current.some((x) => pinKey(x) === key);
      // 073: a pin (a +, an Ask button, a pick) is the record chat is about now: it replaces whatever was pinned, so
      // the next question never carries an earlier record along.
      const pin = d.pin;
      if (pin) {
        setPins([pin]);
        announce(`${pin.label} added to chat`);
      }
      if (d.intent) { asked.current = null; setIntent(d.intent); setText(""); setLog((l) => [...l, { kind: "amax", text: `${d.prompt ?? "New record"}: tell me the details and I'll fill it in.`, tools: [] }]); }
      else if (d.prompt) {
        asked.current = key ? { key, added } : null;
        filled.current = d.prompt;
        setText(d.prompt);
      }
    };
    window.addEventListener("amax:chat", onEvent);
    return () => window.removeEventListener("amax:chat", onEvent);
  }, []);

  // Pick mode: click anything with an "Add to chat" button to pin it.
  useEffect(() => {
    document.body.classList.toggle("picking", picking);
    if (!picking) return;
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(".pinnable");
      const btn = target?.querySelector<HTMLButtonElement>(".pin[data-pin]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      btn.click();
      setPicking(false);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [picking]);

  const close = useCallback(() => { setPicking(false); onClose(); returnFocus.current?.focus({ preventScroll: true }); }, [onClose, returnFocus]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (history) { setHistory(null); input.current?.focus({ preventScroll: true }); } else close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close, history]);

  async function showHistory() {
    if (history) { setHistory(null); return; }
    const r = await listChats("", userId);
    setHistory(r.ok ? { items: r.items } : { items: [], error: r.error });
  }

  function newChat() {
    convo.current = undefined;
    setLog([]);
    setPins([]);
    setIntent(undefined);
    setHistory(null);
    input.current?.focus({ preventScroll: true });
  }

  async function reopen(id: string) {
    const r = await openChat(id, userId);
    if (!r.ok) { setHistory((h) => ({ items: h?.items ?? [], error: r.error })); return; }
    convo.current = r.conversation.id;
    fields.current = r.conversation.pending.flatMap((p) => p.fields);
    setLog(restoredLog(r.conversation));
    setPins(r.conversation.pins);
    setIntent(undefined);
    setHistory(null);
    input.current?.focus({ preventScroll: true });
    announce(`Reopened ${r.conversation.title}`);
  }

  async function send(message: string) {
    if (!message.trim() || busy) return;
    setText("");
    setHistory(null);
    setBusy(true);
    setLog((l) => [...l, { kind: "me", text: message, highlights: [] }]);
    const sent = pins;
    const r = await sendChat({ conversationId: convo.current, text: message, pins: sent, intentId: intent, path: pathname, as: userId });
    setBusy(false);
    if (!r.ok) { setLog((l) => [...l, { kind: "amax", text: r.error, tools: [], error: true }]); return; }
    convo.current = r.conversationId;
    // The pins as the turn read them: current labels, old pins moved onto ids (059).
    setPins((ps) => withFresh(ps, sent, r.pins));
    if (r.usage) setTurnUsage(r.usage);
    setIntent(undefined);
    fields.current = r.pending.flatMap((p) => p.fields);
    setLog((l) => {
      const copy = [...l];
      const last = copy.findLastIndex((x) => x.kind === "me");
      if (last >= 0) copy[last] = { kind: "me", text: message, highlights: r.highlights };
      return [...copy, ...(r.reply ? [{ kind: "amax" as const, text: r.reply, tools: r.toolsRun }] : []), ...r.pending.map((action) => ({ kind: "confirm" as const, action, state: "open" as const }))];
    });
    announce(r.pending.length ? "amax prepared a change for you to confirm" : "amax replied");
  }

  async function decide(action: PendingAction, ok: boolean) {
    if (!convo.current) return;
    // One decision per card: the buttons go away while the request is in flight.
    setLog((l) => l.map((x) => (x.kind === "confirm" && x.action.id === action.id ? { ...x, state: "working", note: undefined } : x)));
    const apply = (o: CardOutcome) => setLog((l) => l.map((x) => (x.kind === "confirm" && x.action.id === action.id ? { ...x, ...o } : x)));
    try {
      // The server says what the card is now: done, cancelled, back open to retry, or an error.
      const o = ok ? await confirmChat(convo.current, action.id, userId) : await cancelChat(convo.current, action.id, userId);
      apply(o);
      announce(o.note);
      // The record this page shows was renamed (a re-tag): follow it, or the page would read "not found".
      // A client-side replace keeps this conversation open on the new page.
      const to = followMove(window.location.pathname, o.moved);
      if (to) router.replace(to);
      // A write may have renamed a pinned record: read the pins' labels again (059). Pins name records
      // by id, so nothing is rewritten; a pin added or removed meanwhile stays as it is.
      const sent = pins;
      if (o.state === "done" && sent.length) {
        const fresh = await refreshPins(sent, userId);
        if (fresh) setPins((ps) => withFresh(ps, sent, fresh));
      }
    } catch {
      // The request itself failed (network, server): bring the buttons back so the user can retry.
      apply({ state: "open", note: "That didn't go through. Try again." });
      announce("That didn't go through. Try again.");
    }
  }

  function talk() {
    const Ctor = (window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition;
    if (!voice || !Ctor) { input.current?.focus({ preventScroll: true }); return; }
    const rec = new Ctor();
    rec.lang = navigator.language.startsWith("si") || navigator.language.endsWith("LK") ? "en-LK" : "en-AU";
    rec.interimResults = false;
    rec.onresult = (e) => send(e.results[0][0].transcript);
    rec.onend = () => setTalking(false);
    setTalking(true);
    rec.start();
  }

  return (
    <aside className={open ? "chat open" : "chat"} id="chat" aria-label="amax chat" inert={!open}>
      <header className="c-head">
        <span className="c-face"><Mascot /></span>
        <div><b>amax</b><small data-testid="chat-page">{intent ? "Filling in a new record" : page?.label ?? "Ask, add or drop anything here"}</small></div>
        {signedIn && <button className="iconbtn h-toggle" type="button" aria-label="Chat history" aria-pressed={history !== null} title="History" onClick={showHistory}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2" /></svg></button>}
        <button className="iconbtn" type="button" aria-label="Close chat" onClick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </header>
      {history && <History key={history.error ?? "list"} initial={history.items} error={history.error} onOpen={reopen} onNew={newChat} as={userId} />}
      <div className="c-log" hidden={history !== null} role="log" aria-live="polite" aria-label="Conversation" ref={logRef}>
        {!signedIn && <div className="m"><div className="b">Sign in to use amax chat.</div></div>}
        {log.map((e, i) => {
          if (e.kind === "me") return <div key={i} className="m me"><div className="b"><Marked text={e.text} highlights={e.highlights} fields={fields.current} /></div></div>;
          if (e.kind === "amax") return (
            <div key={i} className="m"><div className="b">
              {e.tools.length > 0 && <div className="tools" aria-label="Tools used">{e.tools.map((t, j) => <span key={j}>{t}</span>)}</div>}
              {e.error ? <p className="err">{e.text}</p> : <Markdown text={e.text} />}
            </div></div>
          );
          return (
            <div key={i} className="m"><div className="b" role="group" aria-label={`Confirm: ${e.action.title}`}>
              <p><b>{e.action.title}</b></p>
              <dl className="rec">{(e.action.lines ?? Object.entries(e.action.input).map(([label, v]) => ({ label, value: String(v) }))).map(({ label, value }, j) =>
                <div key={j} style={{ display: "contents" }}><dt className={e.action.lines ? FIELD_CLASSES[j % FIELD_CLASSES.length] : fieldClass(e.action.fields, label)}><span className="fd" />{label}</dt><dd>{value}</dd></div>)}</dl>
              {e.state === "open" ? (<>
                {e.note && <p className="err">{e.note}</p>}
                {e.action.secret && convo.current ? (
                  <SecretConfirm conversationId={convo.current} as={userId} action={{ ...e.action, secret: e.action.secret }} onCancel={() => decide(e.action, false)}
                    onState={(o) => setLog((l) => l.map((x) => (x.kind === "confirm" && x.action.id === e.action.id ? { ...x, ...o } : x)))} />
                ) : (
                  <div className="acts">
                  <button className="btn sm primary" type="button" onClick={() => decide(e.action, true)}>Add it</button>
                  <button className="btn sm" type="button" onClick={() => { setText("Change "); input.current?.focus({ preventScroll: true }); }}>Change something</button>
                  <button className="btn sm" type="button" onClick={() => decide(e.action, false)}>Cancel</button>
                  </div>
                )}
              </>) : e.state === "expired" ? (
                <p className="muted" style={{ marginTop: 10 }}><span className="chip">Expired</span> Ask again to make a fresh request.</p>
              ) : <p className={e.state === "error" ? "err" : "muted"} style={{ marginTop: 10 }}>{e.state === "working" ? "Working on it…" : e.note}</p>}
              {e.reveal && <RevealOnce reveal={e.reveal} onDone={() => setLog((l) => l.map((x) => (x.kind === "confirm" && x.action.id === e.action.id ? { ...x, reveal: undefined } : x)))} />}
            </div></div>
          );
        })}
        {busy && <div className="m"><div className="b"><div className="dots" aria-label="amax is thinking"><i /><i /><i /></div></div></div>}
      </div>
      <div className="c-ctx" aria-label="Pinned context">
        {pins.map((p) => (
          <span key={pinKey(p)} className={p.unavailable ? "pinchip muted" : "pinchip"}><span>{p.label}</span><button type="button" aria-label={`Remove ${p.label} from chat`} onClick={() => setPins((x) => x.filter((y) => pinKey(y) !== pinKey(p)))}>×</button></span>
        ))}
      </div>
      {signedIn && !busy && !text && page && <Suggestions items={page.suggestions} onPick={(prompt) => { filled.current = prompt; setText(prompt); }} />}
      <form className="c-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        {/* Enter sends; Shift+Enter starts a new line. */}
        <textarea ref={input} rows={1} value={text} onChange={(e) => { filled.current = null; setText(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); return; } toEnd(e.currentTarget); }}
          onPointerDown={() => { filled.current = null; }} autoComplete="off" aria-label="Message amax" placeholder={signedIn ? "Type, or tap amax and talk" : "Sign in first"} disabled={!signedIn} />
        <button className="c-send" type="submit" aria-label="Send" disabled={!signedIn || busy}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7z" /></svg></button>
      </form>
      <div className="c-dock">
        <button className="c-round" type="button" aria-pressed={picking} title="Pick something on the screen" aria-label="Pick from the screen" onClick={() => setPicking(!picking)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="4" /></svg></button>
        <button className="c-talk" type="button" aria-pressed={talking} aria-label={voice ? "Talk to amax" : "Voice input is off; type instead"} onClick={talk}><Mascot /></button>
        <button className="c-round" type="button" title="New conversation" aria-label="New conversation" onClick={() => { convo.current = undefined; setLog([]); setPins([]); setIntent(undefined); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" /></svg></button>
      </div>
      {signedIn && (turnUsage ?? usage) && <p className="c-usage pinnable" data-testid="chat-usage"><span>{turnUsage ?? usage}</span><PinButton inline pin={{ label: "My AI usage this month", tool: "get_ai_usage", args: { scope: "self" } }} /></p>}
    </aside>
  );
}
