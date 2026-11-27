import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { gate, isPublicPath, landing } from "@amax/auth/gate";
import { sessionStamp } from "@amax/auth/authjs";
import { pageChannel, takeRate } from "@amax/core/rate-limit";
import { githubMismatchForward } from "./lib/github-return";
import { wireProxy } from "./lib/rate-wiring";
import { auth } from "./auth";

type Handler = (req: NextRequest, ev: NextFetchEvent) => Promise<Response>;

// With a lazily configured NextAuth, auth(fn) resolves to the wrapped handler.
const guarded: Promise<Handler> | null = process.env.DATABASE_URL
  ? (auth((req) => {
      const home = landing(req.nextUrl, Boolean(req.auth));
      if (home) return NextResponse.rewrite(home);
      const to = gate(req.nextUrl, Boolean(req.auth));
      if (to) return NextResponse.redirect(to);
      // 035 AC-5: pages are limited per user and tenant, like REST and MCP calls. Only navigations
      // count: document loads and the RSC fetch of a client-side navigation (the same work, and
      // skipping it would let any client dodge the limit by sending "rsc: 1"). Prefetches are the
      // router's speculation, counted in their own budget; server actions (POST only) are counted where
      // their work runs, per tool call in the registry (060 AC-4).
      // Wires this bundle's runtime, the AMAX_RATE_* limits and the recorder of 429s, wherever the host
      // runs the proxy (its own function on Vercel, its own worker on Cloudflare) (review 058).
      wireProxy();
      const stamp = sessionStamp(req.auth);
      const channel = pageChannel(req.method, req.headers);
      const r = stamp?.tenantId && channel ? takeRate({ tenantId: stamp.tenantId, userId: stamp.userId, channel }) : { ok: true as const };
      return r.ok ? NextResponse.next() : new NextResponse("Too many requests. Wait a moment and try again.", { status: 429, headers: { "retry-after": String(r.retryAfter) } });
    }) as unknown as Promise<Handler>)
  : null;

// Signed-out visitors are sent to /signin. Without a database the app is a guest preview.
export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const forward = githubMismatchForward(req.nextUrl);
  if (forward) return NextResponse.redirect(forward);
  if (!guarded || isPublicPath(req.nextUrl.pathname)) return NextResponse.next();
  return (await guarded)(req, ev);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|marketing/[^/]+\\.(?:mp4|webm|vtt|jpg)$|.*\\.(?:svg|png|jpg|webp|ico|css|js)$).*)"] };
