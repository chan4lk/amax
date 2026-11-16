// Paths that work signed out: sign-in itself, Auth.js callbacks, health, and machine endpoints that
// carry their own bearer auth (cron tick, SCIM).
const PUBLIC = [/^\/signin(\/|$)/, /^\/api\/auth(\/|$)/, /^\/healthz$/, /^\/api\/jobs\/tick$/, /^\/api\/scim(\/|$)/,
  // 004: MCP and its OAuth endpoints authenticate with bearer tokens / PKCE, not the web session.
  /^\/api\/mcp$/, /^\/\.well-known\//, /^\/oauth\/(token|register|revoke)$/,
  // 112 AC-5: GitHub's return checks the session itself; signed out, it sends the person to sign in by way of Git accounts.
  /^\/api\/git\/github\/callback$/,
  // 035: the REST API authenticates every call with an API key or a client-credentials token.
  /^\/api\/v1(\/|$)/,
  // 062: the public marketing page, shown to signed-out visitors at /.
  /^\/welcome$/, /^\/(robots\.txt|sitemap\.xml)$/];

export const isPublicPath = (pathname: string) => PUBLIC.some((re) => re.test(pathname));

// 062: signed-out visitors at / see the marketing page in place (a rewrite, so the URL stays /).
export const landing = (url: URL, signedIn: boolean): URL | null => (!signedIn && url.pathname === "/" ? new URL("/welcome", url) : null);

// Signed-out visitors go to /signin, remembering where they were headed.
export function gate(url: URL, signedIn: boolean): URL | null {
  if (signedIn || isPublicPath(url.pathname)) return null;
  const to = new URL("/signin", url);
  if (url.pathname !== "/") to.searchParams.set("next", url.pathname + url.search);
  return to;
}
