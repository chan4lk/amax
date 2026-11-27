import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import publicConfig from "../playwright.config";
import authConfig from "../playwright.auth.config";

// 154: every e2e spec runs on exactly one side. The public run has no database; a spec it skips must run in exactly one
// signed-in project, and a spec it runs must be on this list of public pages. project-tabs (144) and release-pages (147)
// were on neither side, and PR #134's CI failed on them. A new spec has to be placed on one side or the other.
const PUBLIC = ["marketing-seo.spec.ts", "marketing-theme.spec.ts", "marketing-video.spec.ts", "marketing.spec.ts", "shell.spec.ts"];
const dir = join(__dirname, "e2e");
// Playwright's own default testMatch, so a spec under any extension it runs has to be placed too.
const specs = readdirSync(dir).filter((f) => /\.(spec|test)\.[cm]?[jt]sx?$/.test(f)).sort();
const matches = (pattern: unknown, file: string) => [pattern].flat().some((p) => p instanceof RegExp && p.test(file));
const signedInProjects = (file: string) => (authConfig.projects ?? []).filter((p) => matches(p.testMatch, file)).map((p) => p.name);

describe("154 every e2e spec runs on exactly one side", () => {
  it.each(specs)("%s", (file) => {
    if (PUBLIC.includes(file)) {
      expect([matches(publicConfig.testIgnore, file), signedInProjects(file)]).toEqual([false, []]);
      expect(readFileSync(join(dir, file), "utf8")).not.toMatch(/\bsignIn\(|from "postgres"/);
    } else {
      expect(matches(publicConfig.testIgnore, file)).toBe(true);
      expect(signedInProjects(file)).toHaveLength(1);
    }
  });

  it("the public list names only specs that exist", () => {
    expect(PUBLIC.filter((f) => !specs.includes(f))).toEqual([]);
  });
});
