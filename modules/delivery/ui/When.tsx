"use client";

const inUtc = (at: string) => `${new Date(at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
const local = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function When({ at }: { at: string }) {
  return <time dateTime={at} suppressHydrationWarning ref={(el) => { if (el) el.textContent = local(at); }}>{inUtc(at)}</time>;
}
