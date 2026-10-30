import { beforeAll, describe, expect, it } from "vitest";
import { SUBJECT, gateRepo, round } from "./review-gate-fixture";

type Step = (head: string) => Record<string, string | null>;
const { init, branch, run } = gateRepo();
const changeMd = (name: string, header: string, verify = "", body = "") =>
  ({ [`.specclaw/changes/${name}/change.md`]: `**Review:** ${header}\n${body}## Verify\n${verify}\n` });
const finalAt = (name: string): Step => (h) => ({ [`.specclaw/changes/${name}/review/round-1.json`]: round(1, h, { final: true, status: "clean" }) });
const stacked: Step = () => ({ ...changeMd("103-stacked", "covered-by 101-cover"), "modules/demo/b.ts": "export {};\n" });
const cover = (verify: string): Step => () => changeMd("archive/101-cover", "change", verify);
const reviewed: Step = (h) => ({ ...cover("loop covered 103-stacked: **Review:** covered-by 101-cover")(h), ...finalAt("archive/101-cover")(h) });
const later = (subject: string): Step => () => ({ [SUBJECT]: subject, "modules/demo/c.ts": "export {};\n" });
const mention: Step = (h) => ({
  ...changeMd("archive/101-cover", "change", "loop covered 103-stacked", "## Problem\nSee 090's ## Verify for context.\n## Tasks\n"),
  ...finalAt("archive/101-cover")(h),
});
const archive: Step = () => ({ ".specclaw/changes/103-stacked/change.md": null, ...changeMd("archive/103-stacked", "covered-by 101-cover") });
const heads: Record<string, string> = {};

beforeAll(() => {
  init(() => changeMd("archive/090-old", "change", "loop covered 103-stacked"), finalAt("archive/090-old"));
  heads.covered = branch("covered", [stacked, reviewed]);
  heads.archived = branch("archived", [stacked, reviewed, archive]);
  heads.mention = branch("mention", [stacked, mention]);
  heads.owned = branch("owned", [stacked, reviewed, later("[specclaw] 105-other: code"), (h) => ({ ...changeMd("105-other", "change"), ...finalAt("105-other")(h) })]);
  heads.ownedEarly = branch("owned-early", [stacked, (h) => ({ ...reviewed(h), ...changeMd("105-other", "change"), ...finalAt("105-other")(h) }), later("[specclaw] 105-other: code")]);
  heads.between = branch("between", [stacked, reviewed, later("specclaw(103-stacked): more code")]);
  heads.coverOwn = branch("cover-own", [stacked, reviewed, later("specclaw(101-cover): review fixes")]);
  heads.early = branch("early", [cover("loop covered 103-stacked"), finalAt("archive/101-cover"), stacked]);
  heads.unnamedInVerify = branch("unnamed-in-verify", [stacked, (h) => ({ ...cover("loop covered the stack")(h), ...finalAt("archive/101-cover")(h) })]);
  heads.old = branch("old", [() => changeMd("103-stacked", "covered-by 090-old")]);
  heads.own = branch("own", [stacked, (h) => ({ ...cover("loop covered 103-stacked")(h), ...finalAt("archive/101-cover")(h), ".specclaw/changes/103-stacked/review/round-1.json": round(1, h, { counts: { blocker: 2 } }) })]);
  heads.missing = branch("missing", [() => changeMd("103-stacked", "covered-by 109-nowhere")]);
  heads.self = branch("self", [() => changeMd("103-stacked", "covered-by 103-stacked")]);
  heads.unnamed = branch("unnamed", [() => ({ ".specclaw/changes/103-stacked/change.md": "**Review:** covered-by\n090-old is the stack root\n" })]);
  heads.chain = branch("chain", [() => ({ ...changeMd("103-stacked", "covered-by 090-old"), ...changeMd("104-chained", "covered-by 103-stacked") })]);
});

describe("078 covered-by review scope", () => {
  it.each(["covered", "archived", "owned", "mention", "coverOwn"])("AC1 AC2 a fork PR passes a covered-by change whose named loop saw its commits: %s", (key) => {
    expect(run(heads[key], true).out).toMatch(/103-stacked\s+scope=covered-by pass — covered by 101-cover: final round 1\/5 clean/);
  });

  it.each([
    ["between", /fail — covered by 101-cover: [0-9a-f]{7} came after 101-cover's final pass and no other loop in the PR reviewed it/],
    ["ownedEarly", /103-stacked .*fail — covered by 101-cover: [0-9a-f]{7} came after 101-cover's final pass/],
    ["early", /103-stacked .*fail — covered by 101-cover: 101-cover's final pass ran before any 103-stacked commit/],
    ["unnamedInVerify", /fail — covered by 101-cover: 101-cover's ## Verify doesn't name 103-stacked/],
    ["old", /fail — covered by 090-old: 090-old's final pass is already in the PR's base/],
    ["own", /fail — covered by 101-cover: 103-stacked has review rounds of its own/],
    ["missing", /fail — covered by 109-nowhere: no such change at the PR head/],
    ["self", /fail — covered by 103-stacked: a change can't cover itself/],
    ["unnamed", /fail — covered by \(none\): covered-by names no change/],
    ["chain", /104-chained .*fail — covered by 103-stacked: 103-stacked is itself covered-by, no chains/],
  ])("AC3 a fork PR fails covered-by when %s", (key, reason) => {
    expect(run(heads[key], true)).toMatchObject({ code: 1, out: expect.stringMatching(reason) });
  });

  it("AC4 a same-repo PR skips a covered-by change", () => {
    expect(run(heads.missing, false)).toMatchObject({ code: 0, out: expect.stringMatching(/103-stacked\s+scope=covered-by skip/) });
  });
});
