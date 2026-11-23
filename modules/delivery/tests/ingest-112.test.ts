import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { configureRuntime } from "@amax/core/server";
import { linkGitIdentity, setGitHubIdentities } from "@amax/auth/git-identity";
import { authorOf, type Commit } from "../server/ingest";

const T = "11111111-1111-4111-8111-111111111112";
const KASUN = "11111111-1111-4111-8111-11111111c112", NIMAL = "11111111-1111-4111-8111-11111111d112";
const commit = (login: string, email: string, verified = true): Commit => ({ id: "0a0b0c0d", message: "work", login, email, verified, at: "2026-11-16T09:00:00Z" });

// 112 AC-1: a commit is credited through a connected GitHub identity only for one of its person's verified emails.
describe.skipIf(!hasDb)("112 commits credited by GitHub account (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  beforeAll(async () => {
    t = await migratedDatabase();
    configureRuntime({ db: t.app(), auditKey: "k".repeat(32) });
    await t.owner`insert into core.tenant (id, name) values (${T}, 'Fictional')`;
    for (const [id, email] of [[KASUN, "kasun@lumen.test"], [NIMAL, "nimal@lumen.test"]]) await t.owner`insert into auth.user (id, tenant_id, email, name) values (${id}, ${T}, ${email}, ${email})`;
    await withTenant(t.app(), T, async (tx) => {
      await setGitHubIdentities(tx, T, KASUN, { login: "kasun-old", githubId: 4821937, emails: ["kasun@lumen.test", "4821937+kasun-old@users.noreply.github.com"] });
      await setGitHubIdentities(tx, T, NIMAL, { login: "nimal-gh", githubId: 999, emails: ["nimal@lumen.test"] });
      await linkGitIdentity(tx, T, { provider: "github", login: "nimal-legacy", email: null, userId: NIMAL });
    });
  }, 60_000);
  afterAll(() => t?.drop());

  it.each([
    ["the connected person, from one of their verified emails", commit("kasun-old", "4821937+kasun-old@users.noreply.github.com"), KASUN],
    ["someone else who took the renamed login, signed by GitHub", commit("kasun-old", "stranger@example.test"), null],
    ["the connected person's login, an email they never verified", commit("kasun-old", "kasun@elsewhere.test"), null],
    ["a connected login with someone else's verified email: nobody, left for an Admin", commit("kasun-old", "nimal@lumen.test"), null],
    ["a login linked before 108, from a connected person's verified email: credited to the email's holder", commit("nimal-legacy", "kasun@lumen.test"), KASUN],
    ["an identity linked before 108 (no account id), signed by GitHub, as before", commit("nimal-legacy", "nimal@legacy.test"), NIMAL],
  ])("AC1 %s", async (_name, c, who) => {
    expect((await authorOf(T, "github", c)).userId).toBe(who);
  });
});
