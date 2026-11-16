import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { gitIdentitiesOf } from "@amax/auth/git-identity";
import type { Viewer } from "@amax/auth";
import { completeGitHubConnect, isGitHubReplyError, NOT_SET_UP } from "../contracts";
import { setGitHubTimeout } from "../server/github";
import { ctxFor } from "../server/context";
import { gitAccountsDatabase, T } from "./setup";

const stateOf = (url: string) => new URL(url).searchParams.get("state")!;

// 108 AC-1–AC-3, AC-10: connecting GitHub, from the link to the stored emails, against a fake GitHub.
describe.skipIf(!hasDb)("108 connecting GitHub (Postgres)", () => {
  let db: Awaited<ReturnType<typeof gitAccountsDatabase>>;
  let kasun: Viewer, nimal: Viewer;
  beforeAll(async () => { db = await gitAccountsDatabase(); [kasun, nimal] = [await db.as("kasun"), await db.as("nimal")]; }, 120_000);
  afterAll(() => db?.drop());
  const link = async (v: Viewer) => ((await db.registry.call(v, "connect_github", {}, { source: "mcp" })) as { open: { url: string } }).open.url;
  const mine = async (v: Viewer) => (await db.tx((tx) => gitIdentitiesOf(tx, v.userId))).map((g) => g.email).sort();

  it("AC1 without the GitHub app chat says an Admin adds it; with it, the link opens GitHub's authorize page", async () => {
    await expect(db.registry.call(kasun, "connect_github", {}, { source: "mcp" })).rejects.toThrow(NOT_SET_UP);
    expect(await db.registry.call(kasun, "get_my_git_identities", {}, { source: "mcp" })).toEqual({ configured: false, github: null });
    await db.setUpApp();
    const url = new URL(await link(kasun));
    expect([url.origin + url.pathname, url.searchParams.get("client_id"), url.searchParams.get("scope"), url.searchParams.get("redirect_uri")])
      .toEqual([`${db.origin}/login/oauth/authorize`, "app-id", "read:user user:email", "http://localhost:3000/api/git/github/callback"]);
  });

  it.each([
    ["a state someone else was given", async () => ({ who: nimal, state: stateOf(await link(kasun)) })],
    ["a state over 10 minutes old", async () => {
      const state = stateOf(await link(kasun));
      await db.t.owner`update git_accounts.connect_state set created_at = now() - interval '11 minutes'`;
      return { who: kasun, state };
    }],
    ["a state already used", async () => {
      const state = stateOf(await link(kasun));
      await completeGitHubConnect(ctxFor(kasun), { state, code: "good" });
      await db.t.owner`delete from auth.git_identity`;
      return { who: kasun, state };
    }],
    ["a state amax never gave", async () => ({ who: kasun, state: "x".repeat(32) })],
  ])("AC2 %s is refused and nothing is linked", async (_name, make) => {
    const { who, state } = await make();
    await expect(completeGitHubConnect(ctxFor(who), { state, code: "good" })).rejects.toThrow(/expired or was already used/);
    expect(await mine(who)).toEqual([]);
  });

  it.each([
    ["a profile with no login", "nologin", /your profile wasn't readable/],
    ["emails that aren't a list", "noemails", /your emails wasn't readable/],
    ["a code GitHub refuses", "stolen", /GitHub refused the sign-in|the sign-in wasn't readable/],
  ])("review round 1: %s is refused, nothing stored", async (_name, code, error) => {
    await expect(completeGitHubConnect(ctxFor(kasun), { state: stateOf(await link(kasun)), code })).rejects.toThrow(error);
    expect(await mine(kasun)).toEqual([]);
  });

  it.each([
    ["never answers", "hang"],
    ["drops the connection", "reset"],
  ])("review round 2: when GitHub %s, the connect times out, nothing is stored, and no write is held open meanwhile", async (_name, code) => {
    setGitHubTimeout(1500);
    try {
      const pending = completeGitHubConnect(ctxFor(kasun), { state: stateOf(await link(kasun)), code }).then(() => null, (e: unknown) => e);
      await new Promise((ok) => setTimeout(ok, 300));
      const started = Date.now();
      await db.t.owner`update git_accounts.connect_state set created_at = created_at where user_id = ${kasun.userId}`;
      expect(Date.now() - started).toBeLessThan(1000);
      const failed = await pending;
      expect([isGitHubReplyError(failed), (failed as Error).message]).toEqual([true, "GitHub didn't answer for your profile"]);
      expect(await mine(kasun)).toEqual([]);
    } finally { setGitHubTimeout(10_000); }
  });

  it("final pass: a further page of emails is refused rather than read short", async () => {
    await expect(completeGitHubConnect(ctxFor(kasun), { state: stateOf(await link(kasun)), code: "many" })).rejects.toThrow(/more of your emails than amax reads at once/);
  });

  it.each([
    ["GitHub has no verified email", "noverified", async () => {}, "no-email"],
    ["every verified email is someone else's", "good", async () => { await db.t.owner`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified)
      select ${T}, ${nimal.userId}, 'github', 'nimal-x', e, true from unnest(array['kasun@lumenlabs.test', '4821937+kasun-dias@users.noreply.github.com']) e`; }, "all-taken"],
    ["the login is someone else's", "good", async () => { await db.t.owner`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified)
      values (${T}, ${nimal.userId}, 'github', 'kasun-dias', null, false)`; }, "login-taken"],
  ])("final pass: a connect that would link nothing is refused and leaves what was there: %s", async (_name, code, arrange, reason) => {
    await db.t.owner`delete from auth.git_identity`;
    await db.t.owner`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified) values (${T}, ${kasun.userId}, 'github', 'kasun-before', 'kasun.before@example.test', true)`;
    await arrange();
    const refused = await completeGitHubConnect(ctxFor(kasun), { state: stateOf(await link(kasun)), code }).then(() => null, (e: unknown) => e);
    expect([(refused as { reason?: string } | null)?.reason, await mine(kasun)]).toEqual([reason, ["kasun.before@example.test"]]);
    await db.t.owner`delete from auth.git_identity`;
  });

  it("review round 1: in production without AMAX_BASE_URL, connect refuses rather than send GitHub to localhost", async () => {
    const { NODE_ENV, AMAX_BASE_URL } = process.env;
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.AMAX_BASE_URL;
    try {
      await expect(db.registry.call(kasun, "connect_github", {}, { source: "mcp" })).rejects.toThrow(/AMAX_BASE_URL/);
    } finally { Object.assign(process.env, { NODE_ENV, AMAX_BASE_URL }); }
  });

  it("AC3 AC10 the verified emails are stored in one audited write, no token kept, and the open link suggestion withdrawn", async () => {
    await db.t.owner`insert into agents.suggestion (tenant_id, kind, target_type, target_id, target_label, title, proposed, confidence, agent, agent_name, expires_at)
      values (${T}, 'delivery.git-identity', 'auth.git_identity', 'github:kasun-dias', 'kasun-dias on GitHub', 'Link kasun-dias to Kasun', '{}', 0.7, 'delivery', 'Git ingestion', now() + interval '7 days')`;
    const r = await completeGitHubConnect(ctxFor(kasun), { state: stateOf(await link(kasun)), code: "good" });
    expect(await mine(kasun)).toEqual(["4821937+kasun-dias@users.noreply.github.com", "kasun@lumenlabs.test"]);
    const [audit] = await db.tx((tx) => tx.execute(sql`select after::text as after from core.audit_event where action = 'git-accounts.github.connect' order by seq desc limit 1`));
    expect([r.summary, String(audit.after).includes("gho_fake")]).toEqual([`${kasun.name} connected GitHub as @kasun-dias: 2 emails`, false]);
    const [s] = await db.tx((tx) => tx.execute(sql`select status from agents.suggestion where target_id = 'github:kasun-dias'`));
    expect(s.status).toBe("dismissed");
  });
});
