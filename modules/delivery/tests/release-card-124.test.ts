import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRelease, setReleaseProposals, tagRelease } from "../server/services";
import { getRelease } from "../server/queries";
import { listReleaseProposals, releaseNote } from "../server/release-proposals";
import { releaseProposalsCard } from "../server/write-cards";
import { proposeRelease, ReleaseDraft } from "../server/release-card";
import { OPEN, releaseDb } from "./release-db";

describe.skipIf(!hasDb)("124 release chat card (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  beforeAll(async () => { db = await releaseDb(); });
  afterAll(() => db?.t.drop());
  const create = (version: string, more: object = {}) => createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version, ...more });

  it("AC-3 the project's Verified and Released proposals, each with the open release it sits in", async () => {
    const [free, held, proposed, archived] = [await db.proposal("RTK"), await db.proposal("RTK"), await db.proposal("RTK", false), await db.proposal("RTK")];
    await db.t.owner`update delivery.proposal set phase = 'released' where key = ${archived}`;
    await create("l1", { proposalKeys: [held] });
    const listed = await listReleaseProposals(db.sahan, "RTK");
    expect(listed.map((p) => p.key)).toEqual(expect.arrayContaining([free, held, archived]));
    expect(listed.map((p) => p.key)).not.toContain(proposed);
    expect(listed.find((p) => p.key === held)!.inRelease).toEqual({ version: "l1", category: "uat", status: "in_progress" });
    expect(listed.find((p) => p.key === free)!.inRelease).toBeNull();
    await create("l2", { proposalKeys: [archived] });
  });

  it("AC-5 a proposal in another open release moves only when reassign names it, in both writers, audited with where it came from", async () => {
    const [a, b] = [await db.proposal("RTK"), await db.proposal("RTK")];
    await create("m1", { proposalKeys: [a, b] });
    await expect(create("m2", { proposalKeys: [a] })).rejects.toThrow(new RegExp(`${a} is already in RTK m1 \\(UAT, In progress\\); confirm moving it`));
    expect(await create("m2", { proposalKeys: `${a}`, reassign: `${a}` })).toMatchObject({ moved: [{ key: a, from: "m1" }], open: { label: "Open the release", url: "/delivery/releases/RTK/m2" } });
    await expect(setReleaseProposals(db.admin(), { projectKey: "RTK", version: "m2", proposalKeys: [a, b] })).rejects.toThrow(/is already in RTK m1/);
    await setReleaseProposals(db.admin(), { projectKey: "RTK", version: "m2", proposalKeys: [a, b], reassign: [b] });
    expect((await getRelease(db.sahan, "RTK", "m2"))!.proposals.filter((p) => p.included).map((p) => p.key).sort()).toEqual([a, b].sort());
    const [audit] = await db.t.owner`select after from core.audit_event where action = 'delivery.release.proposals' order by seq desc limit 1`;
    expect(audit.after.moved).toEqual([{ key: b, from: "m1" }]);
  });

  it("AC-5 AC-6 both writers' cards show a move before confirm, and only a real one", async () => {
    const x = await db.proposal("RTK");
    await create("s1", { proposalKeys: [x] });
    await create("s2");
    const moves = async (version: string, reassign?: string[]) => (await releaseProposalsCard(db.sahan, { projectKey: "RTK", version, proposalKeys: [x], reassign })).lines.find((l) => l.label === "Moves")?.value;
    expect(await moves("s2", [x])).toBe(`${x} from s1 (UAT, In progress)`);
    expect([await moves("s2"), await moves("s1", [x])]).toEqual([undefined, undefined]);
    expect(await releaseNote(db.sahan, { projectKey: "RTK", proposalKeys: [x], reassign: [x] })).toBe(`${x} is already in RTK s1 (UAT, In progress): it moves to this release`);
    await expect(listReleaseProposals(db.sahan, "NOPE")).rejects.toThrow("no project NOPE");
  });

  it("AC-2 AC-7 the category is matched in any case, and the card refuses each bad field with the service's own message", async () => {
    for (const category of ["UAT", "Dev", "PROD", " uat "]) expect(ReleaseDraft.parse({ projectKey: "RTK", category }).category).toBe(category.trim().toLowerCase());
    const bad = [["name", "x".repeat(121), "a release name is at most 120 characters"], ["version", " ", "the release needs a version"], ["category", "QA", "the category is Dev, UAT or Prod"],
      ["startDate", "2026-02-30", "that date isn't a real calendar day"], ["targetDate", "12/12/2026", "a date is YYYY-MM-DD"]] as const;
    for (const [field, value, message] of bad) {
      await expect(proposeRelease(db.sahan, { projectKey: "RTK", [field]: value })).rejects.toMatchObject({ field, message });
      await expect(create("bad", { [field]: value })).rejects.toThrow(message);
    }
  });

  it("AC-7 padded text reads as the service stores it: the card, create and re-tag agree on the version", async () => {
    expect(ReleaseDraft.parse({ projectKey: "RTK", version: " v1 ", name: " N ", startDate: " 2026-12-01 ", targetDate: "2026-12-02 " }))
      .toMatchObject({ version: "v1", name: "N", startDate: "2026-12-01", targetDate: "2026-12-02" });
    for (const version of [" m1 ", "m1 ", "\tm1"]) {
      await expect(proposeRelease(db.sahan, ReleaseDraft.parse({ projectKey: "RTK", version }))).rejects.toMatchObject({ field: "version", message: "RTK already has a release m1" });
      await expect(create(version)).rejects.toThrow("RTK already has a release m1");
    }
    await expect(tagRelease(db.admin(), { projectKey: "RTK", version: "l2", newVersion: "   " })).rejects.toThrow("the release needs a version");
    expect(await tagRelease(db.admin(), { projectKey: "RTK", version: "l2", newVersion: " l2b " })).toMatchObject({ version: "l2b" });
  });
});
