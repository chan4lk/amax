import { describe, expect, it } from "vitest";
import { proposalsAction } from "../ui/proposals-action";

const af = { key: "AMX", agentFirst: true, repoUrl: "github.com/example/amax" };
const linked = { key: "CON", agentFirst: false, repoUrl: "github.com/example/con" };
const plain = { key: "FLT", agentFirst: false, repoUrl: null };

// 094 AC-8: the Proposals page leads with the repo line when some project is agent-first; manual creation is secondary.
describe("094 AC-8 the Proposals page's header action", () => {
  it.each([
    ["all projects, one agent-first, others take them by hand", [af, plain], ["FLT"], undefined, { kind: "repo-line", addByHand: true }],
    ["all projects, every one agent-first", [af], [], undefined, { kind: "repo-line", addByHand: false }],
    ["all projects, none agent-first", [linked, plain], ["CON", "FLT"], undefined, { kind: "new-proposal" }],
    ["all projects, none agent-first, viewer can't add", [plain], [], undefined, { kind: "none" }],
    ["filtered to the agent-first project", [af, plain], ["FLT"], af, { kind: "repo-line", repoUrl: af.repoUrl, addByHand: false }],
    ["filtered to a manual project", [af, plain], ["FLT"], plain, { kind: "new-proposal" }],
    ["filtered to a project the viewer can't add to", [af, plain], [], plain, { kind: "none" }],
  ] as const)("%s", (_, projects, manual, filtered, expected) => {
    expect(proposalsAction([...projects], [...manual], filtered)).toEqual(expected);
  });
});
