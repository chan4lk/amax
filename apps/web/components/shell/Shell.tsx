"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Chat } from "../chat/Chat";
import { SessionWatch } from "./SessionWatch";
import { LiveRegion, MoreSheet, Rail, TopBar, type LinkLike, type NavItem } from "@amax/ui";
import { ProfileMenu, type MenuLink, type Profile } from "./ProfileMenu";
import { useRouteFocus } from "./useRouteFocus";

type ShellProps = {
  items: NavItem[];
  children: ReactNode;
  profile?: Profile | null;
  banner?: string | null;
  onViewAs?: (role: string | null, as?: string) => Promise<void>;
  onSignOut?: () => Promise<void>;
  /** Voice input allowed by the tenant's AI policy (033). */
  voice?: boolean;
  /** The signed-in person's own AI usage this month, for the chat footer (048). */
  usage?: string | null;
  /** Controls modules add to the top bar (030's bell), rendered on the server. */
  topBar?: ReactNode;
  /** Module screens reached from the profile menu (030's Notifications). */
  menuLinks?: MenuLink[];
  /** Module screens that live under Settings (038): the rail marks Settings while one is open. */
  settingsPaths?: string[];
};

export function Shell({ items, children, profile = null, banner, onViewAs, onSignOut, voice = false, usage = null, topBar, menuLinks = [], settingsPaths = [] }: ShellProps) {
  const pathname = useRouteFocus();
  const under = (h: string) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`));
  // The rail marks the deepest entry the page sits under (/delivery/p/CON → Projects).
  const current = settingsPaths.some(under) ? "/settings" : (items.map((i) => i.href).filter(under).sort((a, b) => b.length - a.length)[0] ?? pathname);
  const sheet = useRef<HTMLDialogElement>(null);
  const link = Link as unknown as LinkLike;
  const [chatOpen, setChatOpen] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  // Opening chat from Ask amax or the shortcut starts fresh (no pins, no leftover prompt); a pin or Ask button brings its record.
  const [fresh, setFresh] = useState(0);
  const openNow = useRef(chatOpen);
  openNow.current = chatOpen;
  const launch = useRef(() => { if (!openNow.current) setFresh((n) => n + 1); setChatOpen((o) => !o); }).current;
  // Ask amax, ⌘K and Ctrl+K open the chat (005 AC-1); pins and intents open it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); launch(); }
    };
    const onChat = () => setChatOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("amax:chat", onChat);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("amax:chat", onChat); };
  }, []);
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <div className="app">
        <Rail items={items} current={current} link={link} onMore={() => sheet.current?.showModal()} />
        <div className="content">
          <TopBar askRef={askRef} askOpen={chatOpen} onAsk={launch} bell={topBar} profile={<ProfileMenu profile={profile} onViewAs={onViewAs && profile ? (role) => onViewAs(role, profile.userId) : undefined} onSignOut={onSignOut} links={menuLinks} />} />
          <main id="main" tabIndex={-1}>
            {banner && <div className="viewbanner" role="note">{banner}</div>}
            {children}
          </main>
        </div>
      </div>
      <MoreSheet ref={sheet} items={items} current={current} link={link} onClose={() => sheet.current?.close()} />
      <Chat open={chatOpen} fresh={fresh} onClose={() => setChatOpen(false)} returnFocus={askRef} signedIn={Boolean(profile)} userId={profile?.userId} voice={voice} usage={usage} />
      {profile && <SessionWatch userId={profile.userId} />}
      <LiveRegion />
    </>
  );
}
