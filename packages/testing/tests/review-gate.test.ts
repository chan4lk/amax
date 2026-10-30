import { beforeAll, describe, expect, it } from "vitest";
import { gateRepo, round } from "./review-gate-fixture";

const { init, branch, run } = gateRepo();
const dir = ".specclaw/changes/101-demo";
const modDir = ".specclaw/changes/102-module-close";
const heads: Record<string, string> = {};

beforeAll(() => {
  init(() => ({ "modules/demo/index.ts": "export {};\n" }));
  const code = () => ({ [`${dir}/change.md`]: "**Review:** change\n## Verify\n", "modules/demo/index.ts": "export const a = 1;\n" });
  heads.reviewed = branch("reviewed", [code, (h) => ({ [`${dir}/review/round-1.json`]: round(1, h), [`${dir}/review/round-2.json`]: round(2, h, { final: true, status: "clean" }) })]);
  heads.unreviewed = branch("unreviewed", [code]);
  heads.blocked = branch("blocked", [code, (h) => ({ [`${dir}/review/round-1.json`]: round(1, h, { final: true, counts: { blocker: 1 } }) })]);
  heads.over = branch("over", [code, (h) => Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`${dir}/review/round-${n}.json`, round(n, h, { final: n === 6 })]))]);
  heads.stale = branch("stale", [code, () => ({ [`${dir}/review/round-1.json`]: round(1, "0".repeat(40), { final: true }) })]);
  heads.noProposal = branch("no-proposal", [() => ({ "modules/demo/index.ts": "export const b = 2;\n" })]);
  heads.moduleEnd = branch("module-end", [() => ({ [`${modDir}/change.md`]: "**Review:** module-end\n" }), (h) => ({ [`${modDir}/review/round-1.json`]: round(1, h, { final: true }) })]);
});

describe("074 review gate", () => {
  it("AC2 prints one line per touched change and exits non-zero on a fail", () => {
    expect(run(heads.reviewed, true)).toMatchObject({ code: 0, out: expect.stringMatching(/101-demo\s+scope=change\s+pass/) });
    expect(run(heads.unreviewed, true)).toMatchObject({ code: 1, out: expect.stringMatching(/101-demo .*fail — no final review round/) });
  });

  it("AC3 a fork PR needs a final round with no blocker, its head in the PR, and at most five passes", () => {
    expect(run(heads.blocked, true).out).toMatch(/1 open blocker\(s\) and no stop recorded/);
    expect(run(heads.over, true).out).toMatch(/6 passes, cap is 5/);
    expect(run(heads.stale, true).out).toMatch(/is not in this PR/);
  });

  it("AC4 a fork PR that changes code with no change dir fails: propose first", () => {
    expect(run(heads.noProposal, true)).toMatchObject({ code: 1, out: expect.stringMatching(/propose first/) });
    expect(run(heads.noProposal, false).code).toBe(0);
  });

  it("AC5 a same-repo PR skips a single change and checks a module-end change", () => {
    expect(run(heads.unreviewed, false)).toMatchObject({ code: 0, out: expect.stringMatching(/skip — single change/) });
    expect(run(heads.moduleEnd, false)).toMatchObject({ code: 1, out: expect.stringMatching(/no round run with --since/) });
  });
});
