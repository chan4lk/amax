import NextAuth, { type NextAuthConfig } from "next-auth";
import { cookies } from "next/headers";
import { authConfig, earlierSession } from "@amax/auth/authjs";
import { loadEnv } from "@amax/core/env";
import { getDb } from "./lib/server";

// Provider config comes from auth.identity_provider; cache it briefly so each request doesn't query it.
let cached: { at: number; config: ReturnType<typeof authConfig> } | undefined;

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  if (!cached || Date.now() - cached.at > 60_000) {
    const env = loadEnv();
    const db = getDb();
    if (!db) throw new Error("amax: sign-in needs DATABASE_URL");
    if (!env.AUTH_SECRET) throw new Error("amax: AUTH_SECRET is required once DATABASE_URL is set");
    const demo = env.AMAX_AUTH_DEMO === "1" && env.AMAX_AUTH_DEMO_TENANT ? { tenantId: env.AMAX_AUTH_DEMO_TENANT } : null;
    const password = env.AMAX_AUTH_PASSWORD_TENANT ? { tenantId: env.AMAX_AUTH_PASSWORD_TENANT } : null;
    // 070 AC-52: the request still carries the browser's earlier session cookie while a sign-in completes.
    const secret = env.AUTH_SECRET;
    const replaced = async () => { const jar = await cookies(); return earlierSession((name) => jar.get(name)?.value, secret); };
    cached = { at: Date.now(), config: authConfig({ db, secret: env.AUTH_SECRET, demo, password, replaced }) };
  }
  // @amax/auth resolves its own next-auth copy (different peer set), so the config type is nominally
  // distinct; the runtime objects are identical (one @auth/core).
  return cached.config as unknown as Promise<NextAuthConfig>;
});
