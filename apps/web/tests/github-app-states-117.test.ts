import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GITHUB_APP_STATES } from "../components/settings/GitHubAppCard";

// 117 review round 4: the app can't import git-accounts (it may be removed), so the card mirrors the module's AppState.
// This keeps the two lists equal: a state the module adds or renames fails here, not on the Integrations page.
describe("117 the card knows every GitHub app state the module reports", () => {
  it("the card's states are the module's AppState", () => {
    const src = readFileSync(join(__dirname, "../../../modules/git-accounts/server/read.ts"), "utf8");
    const union = src.match(/export type AppState = ([^;]+);/)?.[1] ?? "";
    const states = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect([states.length > 0, [...GITHUB_APP_STATES].sort()]).toEqual([true, states.sort()]);
  });
});
