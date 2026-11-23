"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { announce, Icon } from "@amax/ui";
import type { Inbox } from "../contracts";
import { AskButton } from "./AskButton";
import { NotificationList } from "./List";
import { pollInbox } from "./poll";

const POLL_MS = 10_000;
const AFTER_CHANGE_MS = [500, 2000, 4000, 7000, 11000];
const NAV_DELAY_MS = 400;
const unreadIds = (i: Inbox) => i.groups.flatMap((g) => g.items.filter((n) => !n.read));
const label = (n: number) => (n ? `Notifications, ${n} unread` : "Notifications, none unread");

// The shared layout isn't rendered again on navigation, so the bell fetches its list itself: every
// minute while the page is visible, and after each move to another screen.
function useInbox(initial: Inbox, now: number) {
  const [state, setState] = useState({ inbox: initial, now });
  const pathname = usePathname();
  const first = useRef(true);
  const newer = (next: { inbox: Inbox; now: number }) => setState((s) => (next.now >= s.now ? next : s));
  const refresh = () => void pollInbox().then(newer, () => undefined);
  useEffect(() => newer({ inbox: initial, now }), [initial, now]);
  // Shortly after the move, so a navigation that leaves the app (signing out) unmounts the bell first.
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const id = window.setTimeout(refresh, NAV_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [pathname]);
  useEffect(() => {
    const id = window.setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    let soon: number[] = [];
    const onChange = () => { soon.forEach(window.clearTimeout); soon = AFTER_CHANGE_MS.map((ms) => window.setTimeout(refresh, ms)); };
    window.addEventListener("amax:changed", onChange);
    return () => { window.clearInterval(id); soon.forEach(window.clearTimeout); window.removeEventListener("amax:changed", onChange); };
  }, []);
  return state;
}

// New unread items are announced through the live region, after the screen's own announcement when they
// arrive with a navigation; the first render isn't announced.
const ANNOUNCE_AFTER_MS = 1200;
function useAnnounceNew(inbox: Inbox) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const unread = unreadIds(inbox);
    const fresh = seen.current ? unread.filter((n) => !seen.current!.has(n.id)) : [];
    seen.current = new Set([...(seen.current ?? []), ...unread.map((n) => n.id)]);
    if (!fresh.length) return;
    const id = window.setTimeout(() => announce(fresh.length === 1 ? `New notification: ${fresh[0].title}` : `${fresh.length} new notifications`), ANNOUNCE_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [inbox]);
}

export function BellMenu({ initial, now }: { initial: Inbox; now: number }) {
  const { inbox, now: at } = useInbox(initial, now);
  useAnnounceNew(inbox);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("h2")?.focus();
    const close = (focus: boolean) => (setOpen(false), focus && button.current?.focus());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    const onClick = (e: MouseEvent) => !panel.current?.parentElement?.contains(e.target as Node) && close(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => (document.removeEventListener("keydown", onKey), document.removeEventListener("mousedown", onClick));
  }, [open]);
  const empty = inbox.groups.length === 0;
  return (
    <div className="bellwrap">
      <button ref={button} className="iconbtn" type="button" aria-label={label(inbox.unread)} aria-expanded={open} aria-controls="bell-panel" onClick={() => setOpen(!open)}>
        <Icon name="bell" />{inbox.unread > 0 && <i className="count" aria-hidden="true">{inbox.unread > 99 ? "99+" : inbox.unread}</i>}
      </button>
      {open && (
        <div ref={panel} className="bell-panel" id="bell-panel" role="dialog" aria-labelledby="bell-title" onClick={(e) => (e.target as HTMLElement).closest("a, [data-ask]") && setOpen(false)}>
          <div className="card-head">
            <h2 id="bell-title" tabIndex={-1}>Notifications{inbox.unread > 0 && <> <span className="chip">{inbox.unread} unread</span></>}</h2>
            {inbox.unread > 0 && <AskButton label="Mark all read" prompt="Mark all my notifications read" pin={{ label: "My notifications", tool: "get_notifications", args: {} }} />}
          </div>
          {empty ? <p className="muted">You're all caught up. New approvals, releases and reminders show up here.</p> : <NotificationList groups={inbox.groups} now={at} />}
          <div className="foot"><Link href="/notifications">Notification settings</Link></div>
        </div>
      )}
    </div>
  );
}
