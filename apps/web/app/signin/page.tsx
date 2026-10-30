import { redirect } from "next/navigation";
import { listProviders, providerIdFor } from "@amax/auth/authjs";
import { loadEnv } from "@amax/core/env";
import { Card, Logo } from "@amax/ui";
import { AuthError } from "next-auth";
import { signIn, signOut } from "../../auth";
import { SessionPing } from "../../components/shell/SessionWatch";
import { localPath } from "../../lib/local-path";
import { profileOf } from "../../lib/profile";
import { getViewer } from "../../lib/viewer";
import { authEnabled, getDb } from "../../lib/server";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "no-role": "Your account isn't in any amax group yet. Ask your administrator for access.",
  "wrong-tenant": "That account belongs to a different organisation. Sign in with your own organisation's button.",
  "unknown-directory": "Your organisation isn't set up in amax.",
  deactivated: "Your account has been deactivated.",
  AccessDenied: "Access was denied.",
  CredentialsSignin: "Wrong email or password, or the account is locked after too many attempts.",
};

// Credentials failures throw an AuthError; show them on this page instead of a server error.
// 070 AC-52: the session this replaces ends in Auth.js's signIn event, only once the sign-in succeeded.
async function credentialsSignIn(provider: string, fields: Record<string, string>, to: string) {
  "use server";
  try {
    await signIn(provider, { ...fields, redirectTo: to });
  } catch (e) {
    if (e instanceof AuthError) redirect(`/signin?error=${e.type}&next=${encodeURIComponent(to)}`);
    throw e;
  }
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  if (!authEnabled()) redirect("/");
  const { error, next } = await searchParams;
  const to = localPath(next);
  const providers = await listProviders(getDb()!);
  const env = loadEnv();
  const demo = env.AMAX_AUTH_DEMO === "1" && env.NODE_ENV !== "production";
  const password = Boolean(env.AMAX_AUTH_PASSWORD_TENANT);
  // 070 AC-51: one browser has one session for all its tabs, so a signed-in browser switches only on purpose.
  const viewer = await getViewer();
  if (viewer) {
    const me = profileOf(viewer);
    return (
      <main id="main" className="signin">
        <SessionPing />
        <Card>
          <Logo />
          <h1>Sign in to amax</h1>
          <p data-testid="signed-in-as">You're signed in as <b>{me.name}</b> ({me.chip}).</p>
          <div className="signin-switch">
            <a className="btn primary" href={to}>Continue as {me.name.split(" ")[0]}</a>
            <form action={async () => { "use server"; await signOut({ redirectTo: `/signin?next=${encodeURIComponent(to)}` }); }}>
              <button className="btn" type="submit">Sign out to switch account</button>
            </form>
          </div>
          <p className="muted">To use two accounts at once, open the second in another browser profile or a private window.</p>
        </Card>
      </main>
    );
  }
  return (
    <main id="main" className="signin">
      <SessionPing />
      <Card>
        <Logo />
        <h1>Sign in to amax</h1>
        {error && <p role="alert" className="signin-error" data-testid="signin-error">{ERRORS[error] ?? "Sign-in failed. Try again."}</p>}
        {providers.map((p) => (
          <form key={p.providerId} action={async () => { "use server"; await signIn(providerIdFor(p.providerId), { redirectTo: to }); }}>
            <button className="btn primary" type="submit">Sign in with Microsoft · {p.tenantName}</button>
          </form>
        ))}
        {password && (
          <form action={async (data: FormData) => { "use server"; await credentialsSignIn("password", { email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") }, to); }}>
            <label htmlFor="pw-email">Email</label>
            <input id="pw-email" name="email" type="email" autoComplete="username" required />
            <label htmlFor="pw-password">Password</label>
            <input id="pw-password" name="password" type="password" autoComplete="current-password" required />
            <button className="btn primary" type="submit">Sign in</button>
          </form>
        )}
        {!providers.length && !demo && !password && <p>No organisation is set up yet. Run the first-tenant seed (see README).</p>}
        {demo && (
          <form action={async (data: FormData) => { "use server"; await credentialsSignIn("demo", { email: String(data.get("email") ?? "") }, to); }}>
            <label htmlFor="demo-email">Demo user (fixtures only)</label>
            <input id="demo-email" name="email" type="email" defaultValue="maya@lumenlabs.test" required />
            <button className="btn" type="submit">Sign in as demo user</button>
          </form>
        )}
      </Card>
    </main>
  );
}
