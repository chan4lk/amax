import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRelease, tagRelease } from "../server/services";
import { OPEN, releaseDb, T } from "./release-db";

// 154: 0025 named every release made before 145 after its version, and the release page is headed by its name (147).
// A re-tag moves such a name along with the version; a real name stays.
describe.skipIf(!hasDb)("154 a re-tag carries a name that is just the version", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  beforeAll(async () => { db = await releaseDb(); }, 120_000);
  afterAll(() => db?.t.drop());
  const nameOf = async (version: string) => (await db.t.owner`select r.name from delivery.release r join delivery.project p on p.id = r.project_id where p.key = 'RTK' and r.version = ${version}`)[0]?.name;

  it.each([
    { kind: "named after its version (as 0025 left it)", from: "r1", to: "r1.1", name: "r1", want: "r1.1" },
    { kind: "given a real name", from: "r2", to: "r2.1", name: "Spring", want: "Spring" },
    { kind: "untracked, named after its version", from: "r3", to: "r3.1", name: null, want: "r3.1" },
  ])("a release $kind keeps the right name after the re-tag", async ({ from, to, name, want }) => {
    if (name === null) await db.t.owner`insert into delivery.release (tenant_id, project_id, version, name) select ${T}, id, ${from}, ${from} from delivery.project where key = 'RTK'`;
    else await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: from, name });
    await tagRelease(db.admin(), { projectKey: "RTK", version: from, newVersion: to });
    expect(await nameOf(to)).toBe(want);
    // 155: the audit row names the name too, when the re-tag changed it.
    const [audit] = await db.t.owner`select before, after from core.audit_event where action = 'delivery.release.tag' and tenant_id = ${T} order by seq desc limit 1`;
    const renamed = want === to;
    expect([audit.before, audit.after]).toEqual(renamed ? [{ version: from, name: from }, { version: to, name: to }] : [{ version: from }, { version: to }]);
  });
});
