import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { decode } from "next-auth/jwt";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { sql } from "drizzle-orm";
import type { Db } from "@amax/db";
import { signInPassword } from "./password";
import { endReplacedSession, loadViewer, SESSION_HOURS, signInDemo, signInFromDirectory, SignInDenied, signOutSession } from "./session";

export type AuthDeps = {
  db: Db;
  secret: string;
  /** Fixtures-only "sign in as" for local and CI; refused in production. */
  demo?: { tenantId: string } | null;
  /** Email + password sign-in for one tenant (deployments without an identity provider). */
  password?: { tenantId: string } | null;
  env?: Record<string, string | undefined>;
  /** 070 AC-52: the session this browser held before the sign-in that is completing, if any. */
  replaced?: () => Promise<Partial<Stamp> | null | undefined>;
};

type Stamp = { tenantId: string; userId: string; sessionId: string };
const REVALIDATE_MS = 60_000;

// client_secret_ref is "env:NAME" until 031 secrets lands.
export function resolveSecretRef(ref: string, env: Record<string, string | undefined> = process.env) {
  const name = ref.startsWith("env:") ? ref.slice(4) : null;
  const value = name ? env[name] : undefined;
  if (!value) throw new Error(`amax: identity provider secret ${ref} is not set`);
  return value;
}

export async function listProviders(db: Db) {
  return (await db.execute(sql`select * from auth.list_providers()`)).map((p) => ({
    providerId: p.provider_id as string,
    tenantId: p.tenant_id as string,
    tenantName: p.tenant_name as string,
    issuer: p.issuer as string,
    directoryId: p.directory_id as string,
    clientId: p.client_id as string,
    clientSecretRef: p.client_secret_ref as string,
  }));
}

export const providerIdFor = (tenantProviderId: string) => `entra-${tenantProviderId}`;

// One Entra provider per tenant, so each tenant brings its own app registration. The tenant is
// still decided by the token's iss + tid; the provider only says which tenant it must match.
export async function authConfig(deps: AuthDeps): Promise<NextAuthConfig> {
  const env = deps.env ?? process.env;
  const providers = await listProviders(deps.db);
  const byProvider = new Map(providers.map((p) => [providerIdFor(p.providerId), p]));
  const demo = deps.demo && env.NODE_ENV !== "production" ? deps.demo : null;

  return {
    secret: deps.secret,
    trustHost: true,
    session: { strategy: "jwt", maxAge: SESSION_HOURS * 3600 },
    pages: { signIn: "/signin", error: "/signin" },
    providers: [
      ...providers.map((p) =>
        MicrosoftEntraID({
          id: providerIdFor(p.providerId),
          name: p.tenantName,
          clientId: p.clientId,
          clientSecret: resolveSecretRef(p.clientSecretRef, env),
          issuer: p.issuer,
          authorization: { params: { scope: "openid profile email" } },
        }),
      ),
      ...(deps.password
        ? [Credentials({
            id: "password",
            name: "Email and password",
            credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
            async authorize(creds) {
              const tenantId = deps.password!.tenantId;
              try {
                const stamp = await signInPassword(deps.db, tenantId, String(creds?.email ?? ""), String(creds?.password ?? ""));
                return { id: stamp.userId, amax: stamp } as never;
              } catch (e) {
                if (e instanceof SignInDenied) return null;
                throw e;
              }
            },
          })]
        : []),
      ...(demo
        ? [Credentials({
            id: "demo",
            name: "Demo (fixtures)",
            credentials: { email: { label: "Email", type: "email" } },
            async authorize(creds) {
              try {
                const stamp = await signInDemo(deps.db, demo.tenantId, String(creds?.email ?? ""));
                return { id: stamp.userId, amax: stamp } as never;
              } catch (e) {
                if (e instanceof SignInDenied) return null;
                throw e;
              }
            },
          })]
        : []),
    ],
    callbacks: {
      async signIn({ account, profile }) {
        if (!account || account.provider === "demo" || account.provider === "password") return true;
        const p = byProvider.get(account.provider);
        if (!p || !profile) return "/signin?error=AccessDenied";
        try {
          const claims = profile as Record<string, unknown>;
          const stamp = await signInFromDirectory(deps.db, {
            issuer: String(claims.iss ?? ""),
            directoryId: String(claims.tid ?? ""),
            externalId: String(claims.oid ?? claims.sub ?? ""),
            email: String(claims.email ?? claims.preferred_username ?? ""),
            name: String(claims.name ?? ""),
            groups: Array.isArray(claims.groups) ? claims.groups.map(String) : [],
          }, p.tenantId);
          (account as Record<string, unknown>).amax = stamp;
          return true;
        } catch (e) {
          if (e instanceof SignInDenied) return `/signin?error=${e.reason}`;
          throw e;
        }
      },
      // The JWT carries only ids. Every minute it is checked against the session and user rows,
      // so deactivation or sign-out elsewhere ends the browser session within a minute.
      async jwt({ token, account, user }) {
        const stamp = ((account as Record<string, unknown> | null)?.amax ?? (user as Record<string, unknown> | undefined)?.amax) as Stamp | undefined;
        if (stamp) {
          // 070 AC-52 (review round 4): a new session token is minted here, for every provider, only after the sign-in
          // succeeded; Entra's stamp reaches this callback on account.amax or no Entra sign-in works. So the session it
          // replaces ends here, not in an event that would depend on Auth.js passing the same account object on.
          if (deps.replaced) await endReplacedSession(deps.db, await deps.replaced(), stamp);
          return { ...token, ...stamp, checkedAt: Date.now() };
        }
        if (!token.sessionId) return null;
        if (Date.now() - Number(token.checkedAt ?? 0) < REVALIDATE_MS) return token;
        const viewer = await loadViewer(deps.db, String(token.tenantId), String(token.sessionId));
        return viewer ? { ...token, checkedAt: Date.now() } : null;
      },
      session({ session, token }) {
        return { ...session, amax: { tenantId: token.tenantId, userId: token.userId, sessionId: token.sessionId } } as never;
      },
    },
    events: {
      async signOut(message) {
        const token = "token" in message ? message.token : null;
        if (token?.sessionId) await signOutSession(deps.db, String(token.tenantId), String(token.sessionId));
      },
    },
  };
}

export const sessionStamp = (session: unknown) => (session as { amax?: Partial<Stamp> } | null)?.amax;

// Auth.js's session cookie: __Secure- on https; a large token is split into name.0, name.1, ...
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];
const cookieValue = (get: (name: string) => string | undefined, name: string) => {
  const whole = get(name);
  if (whole) return whole;
  const parts: string[] = [];
  for (let i = 0; get(`${name}.${i}`); i++) parts.push(get(`${name}.${i}`)!);
  return parts.join("") || undefined;
};

/**
 * 070 AC-52 (review round 2): the session the browser held before the sign-in now completing, read from the
 * request's own session cookie, which Auth.js has not replaced yet. One reader for the app and its tests; a cookie
 * that doesn't decode with this secret is no earlier session, so nothing is ended.
 */
export async function earlierSession(get: (name: string) => string | undefined, secret: string): Promise<Partial<Stamp> | null> {
  for (const name of SESSION_COOKIES) {
    const raw = cookieValue(get, name);
    if (!raw) continue;
    const t = await decode({ token: raw, secret, salt: name }).catch(() => null);
    return t?.sessionId && t.tenantId ? { tenantId: String(t.tenantId), userId: String(t.userId ?? ""), sessionId: String(t.sessionId) } : null;
  }
  return null;
}
