import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { gitIdentitiesOf, linkGitIdentity, setGitHubIdentities } from "../src/git-identity";

const T = "11111111-1111-4111-8111-111111111108";
const KASUN = "11111111-1111-4111-8111-1111111111a8", NIMAL = "11111111-1111-4111-8111-1111111111b8";

// 108 AC-3–AC-5: one person's GitHub login and verified emails, set as a whole, never taking over someone else's.
describe.skipIf(!hasDb)("108 GitHub identities (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  const tx = <R>(fn: Parameters<typeof withTenant<R>>[2]) => withTenant(t.app(), T, fn);
  const emailsOf = async (userId: string) => (await tx((x) => gitIdentitiesOf(x, userId))).map((g) => `${g.login} ${g.email} ${g.emailVerified}`);
  beforeAll(async () => {
    t = await migratedDatabase();
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Fictional')`;
    for (const [id, email] of [[KASUN, "kasun@lumen.test"], [NIMAL, "nimal@lumen.test"]]) await t.owner`insert into auth.user (id, tenant_id, email, name) values (${id}, ${T}, ${email}, ${email})`;
    await tx((x) => linkGitIdentity(x, T, { provider: "github", login: "nimal-s", email: "nimal@lumen.test", userId: NIMAL }));
  }, 60_000);
  afterAll(() => t?.drop());

  it.each([
    ["the first connect stores every verified email", { login: "kasun-dias", githubId: 100, emails: ["kasun@lumen.test", "1+kasun-dias@users.noreply.github.com", "kasun@example.test"] },
      { linked: 3, removed: [], skipped: [] }, ["kasun-dias 1+kasun-dias@users.noreply.github.com true", "kasun-dias kasun@example.test true", "kasun-dias kasun@lumen.test true"]],
    ["a connect again drops what GitHub no longer lists", { login: "kasun-dias", githubId: 100, emails: ["kasun@lumen.test", "1+kasun-dias@users.noreply.github.com"] },
      { linked: 2, removed: ["kasun@example.test"], skipped: [] }, ["kasun-dias 1+kasun-dias@users.noreply.github.com true", "kasun-dias kasun@lumen.test true"]],
    ["someone else's email is skipped and named, the rest linked", { login: "kasun-dias", githubId: 100, emails: ["kasun@lumen.test", "nimal@lumen.test"] },
      { linked: 1, removed: ["1+kasun-dias@users.noreply.github.com"], skipped: ["nimal@lumen.test"] }, ["kasun-dias kasun@lumen.test true"]],
    ["someone else's login takes nothing over", { login: "nimal-s", githubId: 100, emails: ["kasun@lumen.test"] },
      { linked: 0, removed: ["kasun@lumen.test"], skipped: ["@nimal-s"] }, []],
  ])("AC3 AC4 AC5 %s", async (_name, gh, result, stored) => {
    const r = await tx((x) => setGitHubIdentities(x, T, KASUN, gh));
    expect({ linked: r.linked.length, removed: r.removed, skipped: r.skipped }).toEqual(result);
    expect(await emailsOf(KASUN)).toEqual(stored);
    expect(await emailsOf(NIMAL)).toEqual(["nimal-s nimal@lumen.test true"]);
  });

  it.each([
    ["a renamed login replaces the person's old one", KASUN, { login: "kasun-renamed", githubId: 400, emails: ["kasun@renamed.test"] }, { linked: ["kasun@renamed.test"], skipped: [] }, ["kasun-renamed"]],
    ["someone else can't take the old login under another GitHub account", NIMAL, { login: "kasun-renamed", githubId: 999, emails: ["nimal@reuse.test"] }, { linked: [], skipped: ["@kasun-renamed"] }, []],
    ["someone else can't take the account under a new login", NIMAL, { login: "nimal-fresh", githubId: 400, emails: ["nimal@fresh.test"] }, { linked: [], skipped: ["@nimal-fresh"] }, []],
  ])("final pass 2: %s", async (_name, who, gh, result, logins) => {
    if (who === KASUN) await tx((x) => setGitHubIdentities(x, T, KASUN, { login: "kasun-before", githubId: 400, emails: ["kasun@before.test"] }));
    const r = await tx((x) => setGitHubIdentities(x, T, who, gh));
    expect({ linked: r.linked, skipped: r.skipped }).toEqual(result);
    expect([...new Set((await tx((x) => gitIdentitiesOf(x, who))).filter((g) => g.providerUserId).map((g) => g.login))]).toEqual(logins);
  });

  it("review round 1 (B7): two people linking one email at once: exactly one has it, and only that one reports it linked", async () => {
    const shared = "pair@example.test";
    const [a, b] = await Promise.all([KASUN, NIMAL].map((id, i) => tx((x) => setGitHubIdentities(x, T, id, { login: `racer-${i}`, githubId: 200 + i, emails: [shared] }))));
    const owners = await t.owner`select user_id from auth.git_identity where lower(email) = ${shared}`;
    expect([owners.length, a.linked.length + b.linked.length, [...a.skipped, ...b.skipped]]).toEqual([1, 1, [shared]]);
    expect(owners[0].user_id).toBe(a.linked.length ? KASUN : NIMAL);
  });

  it("review round 2: two people linking one login at once: the login is one person's, the other is told", async () => {
    const [a, b] = await Promise.all([[KASUN, "k@race.test"], [NIMAL, "n@race.test"]].map(([id, email]) => tx((x) => setGitHubIdentities(x, T, id, { login: "same-login", githubId: id === KASUN ? 301 : 302, emails: [email] }))));
    const holders = await t.owner`select distinct user_id from auth.git_identity where lower(login) = 'same-login'`;
    expect([holders.length, [a, b].filter((r) => r.skipped.includes("@same-login")).length]).toEqual([1, 1]);
  });

  it("review round 1 (B9): 0033 keeps one of the rows the old rule allowed, the verified one first, so its indexes build", async () => {
    await t.owner`drop index auth.git_identity_email`;
    await t.owner`drop index auth.git_identity_login_email`;
    await t.owner`insert into auth.git_identity (tenant_id, user_id, provider, login, email, email_verified) values
      (${T}, ${KASUN}, 'github', 'dup-a', 'dup@example.test', false), (${T}, ${NIMAL}, 'github', 'dup-b', 'DUP@example.test', true),
      (${T}, ${KASUN}, 'github', 'Case-Login', null, false), (${T}, ${KASUN}, 'github', 'case-login', null, false)`;
    await t.owner.unsafe(readFileSync(join(__dirname, "../../db/migrations/0033_git_identity_emails.sql"), "utf8"));
    const dup = await t.owner`select login, email_verified from auth.git_identity where lower(email) = 'dup@example.test'`;
    const cased = await t.owner`select count(*)::int as n from auth.git_identity where lower(login) = 'case-login'`;
    expect([dup.map((r) => [r.login, r.email_verified]), cased[0].n]).toEqual([[["dup-b", true]], 1]);
  });

  it("AC4 the schema holds several emails per login, each email one person's", async () => {
    await t.owner`insert into auth.git_identity (tenant_id, user_id, provider, login, email) values (${T}, ${NIMAL}, 'github', 'one-login', 'one@example.test'), (${T}, ${NIMAL}, 'github', 'one-login', 'two@example.test')`;
    await expect(t.owner`insert into auth.git_identity (tenant_id, user_id, provider, login, email) values (${T}, ${KASUN}, 'github', 'other', 'ONE@example.test')`).rejects.toThrow(/git_identity_email/);
    const [{ n }] = await t.owner`select count(*)::int as n from auth.git_identity where provider = 'github' and login = 'one-login'`;
    expect(n).toBe(2);
  });
});
