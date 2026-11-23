import { randomUUID } from "node:crypto";

// Server error logging without content (review round 1, B8). Error messages can quote request
// bodies (JSON SyntaxError), user text or model output, so only the error's class, its code and a
// request id reach the log; the id is returned so the response can carry it for support.
// 115: only control characters are replaced (C0 incl. CR and LF, DEL, C1 incl. NEL, U+2028/U+2029), so spaces stay.
const oneLine = (s: string) => s.replace(/[\n\r\p{Zl}\p{Zp}\x00-\x1f\x7f-\x9f]/gu, "_");

export function logError(scope: string, e: unknown): string {
  const id = randomUUID();
  const name = e instanceof Error ? e.name : typeof e;
  const code = typeof e === "object" && e !== null && "code" in e ? oneLine(String((e as { code: unknown }).code)).slice(0, 40) : undefined;
  // 114: one line whatever a caller or an error holds.
  console.error(`amax ${oneLine(scope)}: ${oneLine(name)}${code ? ` ${code}` : ""} [${id}]`);
  return id;
}
