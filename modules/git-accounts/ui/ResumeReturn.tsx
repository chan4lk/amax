"use client";

import { useEffect } from "react";

/**
 * 112 AC-5: back from sign-in, the return GitHub sent goes on to amax's callback, in a full page load (a route handler
 * can't be reached through the sign-in's own navigation). Only GitHub's query travels; the path is always the callback.
 */
export function ResumeReturn({ query }: { query: string }) {
  const to = `/api/git/github/callback?${new URLSearchParams(query)}`;
  useEffect(() => { window.location.replace(to); }, [to]);
  return <p role="status" aria-live="polite" className="muted">Finishing your GitHub connect… <a href={to}>Continue</a></p>;
}
