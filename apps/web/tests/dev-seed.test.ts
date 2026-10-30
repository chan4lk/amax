import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, migratedDatabase } from "@amax/db/testdb";
import { seedDecision, seedDevDemo } from "../scripts/dev-seed";
import { isMain } from "../scripts/seed-demo";

// 074: `dev` seeds a local database once with the demo data and the 070–073 walkthrough, and never touches anything else.
const key = "dev-seed-test-audit-key-dev-seed-test";
const local = "postgres://amax_app:amax_app@127.0.0.1:5440/amax";

describe("074 dev demo data", () => {
  it.each([
    ["a local database", local, {}, { seed: true }],
    ["localhost", "postgres://u:p@localhost/amax", {}, { seed: true }],
    ["a remote database", "postgres://u:p@db.example.com/amax", {}, { skip: "db.example.com is not a local database" }],
    ["AMAX_SEED_DEMO=0", local, { AMAX_SEED_DEMO: "0" }, { skip: "AMAX_SEED_DEMO=0" }],
    ["no DATABASE_URL", undefined, {}, { skip: "no DATABASE_URL" }],
    ["no audit key", local, { AUDIT_HASH_KEY: undefined }, { skip: "no AUDIT_HASH_KEY" }],
  ])("AC3 %s", (_n, url, env, want) => expect(seedDecision(url, { AUDIT_HASH_KEY: key, ...env })).toEqual(want));

  it("AC4 the command-line check matches the script node started, on Windows paths too", () => {
    const [url, path] = process.platform === "win32"
      ? ["file:///C:/Personal%20Projects/amax/apps/web/scripts/seed-demo.ts", "C:\\Personal Projects\\amax\\apps\\web\\scripts\\seed-demo.ts"]
      : ["file:///home/me/amax/apps/web/scripts/seed-demo.ts", "/home/me/amax/apps/web/scripts/seed-demo.ts"];
    expect([isMain(url, path), isMain(url, undefined), isMain(url, path.replace("seed-demo", "dev-seed"))]).toEqual([true, false, false]);
  });
});

describe.skipIf(!hasDb)("074 dev demo data (Postgres)", () => {
  let t: Awaited<ReturnType<typeof migratedDatabase>>;
  beforeAll(async () => { t = await migratedDatabase(); }, 60_000);
  afterAll(() => t?.drop());
  const week43 = () => t.owner`select u.email, w.status, coalesce(sum(e.hours), 0)::float as hours from time.week w
    join auth.user u on u.id = w.user_id left join time.entry e on e.week_id = w.id and e.deleted_at is null
    where w.iso_week = 43 group by 1, 2 order by 1`;

  it("AC2 the first start seeds the walkthrough; later starts add nothing and keep what was changed in the demo", async () => {
    expect(await seedDevDemo(t.url, key)).toMatch(/^demo data: seeded auth, .*time.* \+ the 070–073 walkthrough$/);
    expect((await week43()).map((r) => [r.email.split("@")[0], r.status, r.hours])).toEqual([
      ["ayesha", "submitted", 8], ["kasun", "submitted", 47], ["liam", "submitted", 40], ["nimal", "submitted", 40], ["tharushi", "draft", 30]]);
    await t.owner`update time.week set status = 'approved', locked_at = now() where user_id = (select id from auth.user where email = 'nimal@lumenlabs.test') and iso_week = 43`;
    const [before] = await t.owner`select (select count(*) from time.entry)::int as entries, (select count(*) from compliance.chain_check)::int as checks`;
    expect(await seedDevDemo(t.url, key)).toBe("demo data: already loaded");
    expect(await t.owner`select (select count(*) from time.entry)::int as entries, (select count(*) from compliance.chain_check)::int as checks`).toEqual([before]);
    expect((await week43()).find((r) => r.email.startsWith("nimal"))?.status).toBe("approved");
  }, 180_000);
});
