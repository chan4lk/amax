import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { createRelease, recordDeployment, setReleaseProposals } from "../server/services";
import { listReleaseProposals } from "../server/release-proposals";
import { releaseProposalsCard } from "../server/write-cards";
import { proposeRelease } from "../server/release-card";
import { OPEN, releaseDb } from "./release-db";

// 129: one "held elsewhere" rule. A proposal in another release, open or completed, moves only when reassign names it;
// the card lists where it is, refuses it on the field until it's ticked to move, and names the move before confirm.
describe.skipIf(!hasDb)("129 a proposal in a completed release moves only when asked (Postgres)", () => {
  let db: Awaited<ReturnType<typeof releaseDb>>;
  let n = 0;
  beforeAll(async () => { db = await releaseDb(); }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    { held: "an open release", completed: false, reassign: false, status: "in_progress", label: "In progress" },
    { held: "a completed release", completed: true, reassign: false, status: "completed", label: "Completed" },
    { held: "a completed release, with reassign", completed: true, reassign: true, status: "completed", label: "Completed" },
  ])("AC-1 AC-2 AC-3 a proposal in $held: the card and both writers agree", async ({ completed, reassign, status, label }) => {
    const i = ++n;
    const [from, to, other] = [`h${i}`, `t${i}`, `o${i}`];
    const p = await db.proposal("RTK");
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: from, proposalKeys: [p] });
    if (completed) await recordDeployment(db.admin(), { projectKey: "RTK", version: from, environment: "UAT" });
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: other });
    const asked = reassign ? [p] : undefined;

    expect((await listReleaseProposals(db.sahan, "RTK")).find((x) => x.key === p)!.inRelease).toEqual({ version: from, category: "uat", status });
    const moves = (await releaseProposalsCard(db.sahan, { projectKey: "RTK", version: other, proposalKeys: [p], reassign: [p] })).lines.find((l) => l.label === "Moves")?.value;
    expect(moves).toBe(`${p} from ${from} (UAT, ${label})`);

    const refusal = new RegExp(`${p} is already in RTK ${from} \\(UAT, ${label}\\); confirm moving it`);
    // The card is checked before the create runs: once the create commits, the version is taken.
    const card = proposeRelease(db.sahan, { projectKey: "RTK", version: to, proposalKeys: [p], reassign: asked });
    const create = () => createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: to, proposalKeys: [p], reassign: asked ?? [] });
    if (reassign) {
      await expect(card).resolves.toBeUndefined();
      await expect(create()).resolves.toMatchObject({ moved: [{ key: p, from }] });
      await setReleaseProposals(db.admin(), { projectKey: "RTK", version: other, proposalKeys: [p], reassign: [p] });
    } else {
      await expect(card).rejects.toMatchObject({ field: "proposalKeys", message: expect.stringMatching(refusal) });
      await expect(create()).rejects.toThrow(refusal);
      await expect(setReleaseProposals(db.admin(), { projectKey: "RTK", version: other, proposalKeys: [p] })).rejects.toThrow(refusal);
    }
  });

  it("AC-4 a proposal Released in a completed release is still refused as shipped, reassign or not", async () => {
    const p = await db.proposal("RTK");
    await createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "s1", proposalKeys: [p], category: "prod" });
    await recordDeployment(db.admin(), { projectKey: "RTK", version: "s1", environment: "Prod" });
    await expect(createRelease(db.admin(), { ...OPEN, projectKey: "RTK", version: "s2", proposalKeys: [p], reassign: [p] })).rejects.toThrow(`${p} already shipped in another release`);
    expect((await listReleaseProposals(db.sahan, "RTK")).map((x) => x.key)).not.toContain(p);
  });
});
