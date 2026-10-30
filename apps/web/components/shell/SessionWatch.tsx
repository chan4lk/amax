"use client";

import { useEffect, useState } from "react";
import { currentIdentity } from "../../app/actions/session";

// 070 amendment 5 (AC-54): one browser has one session cookie for every tab. When another tab signs in or out, this
// tab notices (on focus, on becoming visible, or on a ping from that tab) and asks the server who is signed in now.
// The ping carries no auth data, and nothing is kept in browser storage; the server's answer is all that counts.
const CHANNEL = "amax-session";

export function pingOtherTabs() {
  try {
    const c = new BroadcastChannel(CHANNEL);
    c.postMessage("changed");
    c.close();
  } catch {}
}

export function SessionPing() {
  useEffect(() => pingOtherTabs(), []);
  return null;
}

type Now = { userId: string; name: string } | null;

export function SessionWatch({ userId }: { userId: string }) {
  const [now, setNow] = useState<Now | "same">("same");
  useEffect(() => {
    let live = true;
    const check = () => currentIdentity().then((who) => { if (live) setNow(who?.userId === userId ? "same" : who); }, () => {});
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel(CHANNEL); channel.onmessage = check; } catch {}
    window.addEventListener("focus", check);
    // A page that just loaded may follow a sign-in here: other tabs check who is signed in now.
    pingOtherTabs();
    document.addEventListener("visibilitychange", onVisible);
    return () => { live = false; channel?.close(); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", onVisible); };
  }, [userId]);
  if (now === "same") return null;
  return (
    <div className="session-gone" role="alertdialog" aria-modal="true" aria-labelledby="session-gone-title">
      <div className="card">
        <h2 id="session-gone-title">{now ? `You're now signed in as ${now.name} in another tab.` : "You signed out in another tab."}</h2>
        <p>{now ? `Reload to continue as ${now.name.split(" ")[0]}. Until then this tab can't send or confirm anything.` : "Sign in again to continue."}</p>
        <button className="btn primary" type="button" autoFocus onClick={() => window.location.reload()}>{now ? "Reload" : "Sign in"}</button>
      </div>
    </div>
  );
}
