import { beforeAll, describe, expect, it } from "vitest";
import { gateRepo } from "./review-gate-fixture";

const { init, branch, run } = gateRepo();
const heads: Record<string, string> = {};
const at = (name: string, archived = false) => `.specclaw/changes/${archived ? "archive/" : ""}${name}`;
const folder = (name: string, { archived = false, extra = "" } = {}) => ({
  [`${at(name, archived)}/change.md`]: `**Change:** ${name} · **Review:** covered-by 073-cover\n## Verify\n${extra}`,
  [`${at(name, archived)}/state.json`]: `{ "change": "${name}", "branch": "specclaw/${name}" }\n`,
});
const gone = (name: string, archived = false) => ({ [`${at(name, archived)}/change.md`]: null, [`${at(name, archived)}/state.json`]: null });

const cases: [string, () => Record<string, string | null>, number, RegExp][] = [
  ["only moved", () => ({ ...gone("074-demo"), ...folder("099-demo") }), 0, /099-demo\s+scope=move\s+skip — moved from 074-demo/],
  ["an archived folder only moved", () => ({ ...gone("062-site", true), ...folder("101-site", { archived: true }) }), 0, /101-site\s+scope=move\s+skip — moved from 062-site/],
  ["moved and edited", () => ({ ...gone("074-demo"), ...folder("099-demo", { extra: "- AC-1: pass\n" }) }), 1, /099-demo\s+scope=covered-by .*fail/],
  ["moved with a new file", () => ({ ...gone("074-demo"), ...folder("099-demo"), [`${at("099-demo")}/notes.md`]: "x\n" }), 1, /099-demo\s+scope=covered-by .*fail/],
  ["moved under another slug", () => ({ ...gone("074-demo"), ...folder("099-other") }), 1, /099-other\s+scope=covered-by .*fail/],
  ["moved to two new numbers", () => ({ ...gone("074-demo"), ...folder("099-demo"), ...folder("100-demo") }), 1, /099-demo\s+scope=covered-by .*fail[\s\S]*100-demo\s+scope=covered-by .*fail/],
  ["matched by two removed folders", () => ({ ...gone("074-demo"), ...gone("080-demo"), ...folder("099-demo") }), 1, /099-demo\s+scope=covered-by .*fail/],
  ["archived while a renumbered copy appeared", () => ({ ...gone("074-demo"), ...folder("074-demo", { archived: true }), ...folder("099-demo") }), 1, /099-demo\s+scope=covered-by .*fail/],
  ["moved beside a code change", () => ({ ...gone("074-demo"), ...folder("099-demo"), "modules/demo/index.ts": "export const a = 1;\n" }), 1, /propose first/],
];

beforeAll(() => {
  init(() => ({ ...folder("074-demo"), ...folder("080-demo"), ...folder("062-site", { archived: true }), "modules/demo/index.ts": "export {};\n" }));
  for (const [name, step] of cases) heads[name] = branch(name.replaceAll(" ", "-"), [step]);
});

describe("098 review gate", () => {
  it.each(cases)("AC-7 a fork PR where a folder was %s", (name, _step, code, line) => {
    expect(run(heads[name], true)).toMatchObject({ code, out: expect.stringMatching(line) });
  });
});
