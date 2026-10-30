"use client";

import { useEffect, useState } from "react";
import { ago } from "./age";

// 070 AC-57: the age keeps counting while the page is open; the exact time is in the tooltip.
export function Since({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const when = new Date(at);
  return <time dateTime={at} title={when.toLocaleString()} suppressHydrationWarning>{ago(now - when.getTime())}</time>;
}
