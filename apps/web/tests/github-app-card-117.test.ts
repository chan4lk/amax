import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GitHubAppCard, type GitHubAppState } from "../components/settings/GitHubAppCard";

const draw = (state: GitHubAppState, checkProblem: string | null = null) => renderToStaticMarkup(createElement(GitHubAppCard, {
  app: { state, checkProblem, rotatedAt: "2026-11-16T10:00:00Z", callbackUrl: "http://localhost:3000/api/git/github/callback", callbackProblem: null },
}));

// 117 AC-3 (review round 3, escalated): the Integrations row shows each state as itself: only `ready` is green and
// configured, only the states that need it offer Set up, and a check that couldn't run says why.
describe("117 AC-3 the GitHub app row on Integrations, by state", () => {
  it.each([
    ["none", "chip\">Not configured", true],
    ["expired", "chip warn\">Expired", true],
    ["incomplete", "chip warn\">Incomplete · set it up again", true],
    ["unchecked", "chip warn\">Not checked", false],
    ["ready", "chip good\">Configured · rotated Nov 16, 2026", false],
  ] as const)("%s", (state, chip, setUp) => {
    const html = draw(state, state === "unchecked" ? "amax can't store credentials yet: no key service is set (AMAX_KMS); an operator sets it" : null);
    expect([html.includes(chip), html.includes("Ask amax · Set up the GitHub app"), html.includes("no key service is set")]).toEqual([true, setUp, state === "unchecked"]);
  });
});
