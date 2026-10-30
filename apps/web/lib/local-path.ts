// 070 review round 1 (B8): a `next` target is used only when it stays on this site. The WHATWG parser
// decides, so every spelling a browser reads as another host ("//x", "/\x", "/\t/x", "\\x") falls back to "/".
const HERE = "http://amax.invalid";

export function localPath(next: string | undefined | null): string {
  if (!next?.startsWith("/")) return "/";
  try {
    const u = new URL(next, HERE);
    return u.origin === HERE ? u.pathname + u.search + u.hash : "/";
  } catch {
    return "/";
  }
}
