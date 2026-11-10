import { describe, expect, it } from "vitest";
import { scriptedProvider } from "../src/scripted";
import { scriptedWrite } from "../src/scripted-writes";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const calls = (ask: string) => scriptedWrite(ask)?.map((c) => [c.name, c.input]) ?? null;

// 057: Team time prompts carry the week id, and the scripted model acts on that id, never on a name.
describe("057 scripted approve and remind act on the week id in the prompt", () => {
  it.each([
    ["one approve", `Approve Nimal Silva's timesheet for 2026-W42 (week id ${A})`, [["approve_week", { weekId: A }]]],
    ["one remind", `Remind Kasun Dias's timesheet for 2026-W42 (week id ${B})`, [["remind_week", { weekId: B }]]],
    ["an apostrophe in the name", `Approve Seán O'Neill's timesheet for 2026-W42 (week id ${C})`, [["approve_week", { weekId: C }]]],
    ["bulk approve, two", `Approve the submitted timesheets for 2026-W42: Nimal Silva (week id ${A}), Kasun Dias (week id ${B})`, [["approve_week", { weekId: A }], ["approve_week", { weekId: B }]]],
    ["bulk approve, a comma-free single", `Approve the submitted timesheets for 2026-W42: Nimal Silva (week id ${A})`, [["approve_week", { weekId: A }]]],
    ["bulk remind, three", `Remind these people to submit their timesheets for 2026-W42: A (week id ${A}), B (week id ${B}), C (week id ${C})`,
      [["remind_week", { weekId: A }], ["remind_week", { weekId: B }], ["remind_week", { weekId: C }]]],
  ])("%s", (_n, ask, want) => expect(calls(ask)).toEqual(want));

  it.each([
    ["a name with no id", "Approve Nimal Silva's timesheet for 2026-W42"],
    ["a bulk list of names", "Approve the submitted timesheets for 2026-W42: Nimal Silva, Kasun Dias"],
    ["a bulk list where one item has no id", `Approve the submitted timesheets for 2026-W42: Nimal Silva (week id ${A}), Kasun Dias`],
    ["a malformed id", "Remind Kasun Dias's timesheet for 2026-W42 (week id not-a-uuid)"],
  ])("does nothing for %s", (_n, ask) => expect(scriptedWrite(ask) ?? []).toEqual([]));
});

describe("057 the scripted model matches only the person's own words, not pinned context", () => {
  const ask = (content: { type: "text"; text: string }[]) =>
    scriptedProvider().call({ model: "m", system: "", messages: [{ role: "user", content }], tools: [] } as never);
  const prompt = `Approve Nimal Silva's timesheet for 2026-W42 (week id ${A})`;

  it.each([
    ["the prompt in the person's own text", [{ type: "text" as const, text: "Pinned context:\n<data>{}</data>" }, { type: "text" as const, text: prompt }], "approve_week"],
    ["the prompt only inside pinned data", [{ type: "text" as const, text: `Pinned context:\n<data>${prompt}</data>` }, { type: "text" as const, text: "what is this?" }], "list_projects"],
    ["a tag prompt only inside pinned data", [{ type: "text" as const, text: "Pinned context:\n<data>Tag CON v2.4.0 as v9</data>" }, { type: "text" as const, text: "hi" }], "list_projects"],
  ])("%s", async (_n, content, tool) => {
    const r = await ask(content);
    expect(r.toolCalls.map((c) => c.name)).toEqual([tool]);
  });
});

// 081 amendment 2: the e2e chat model takes a proposal's pin suggestions and an agent suggestion's decision as chat
// writes, by the ids in the prompt, so the browser tests confirm both flows through to the write.
describe("081 scripted proposal suggestions and suggestion decisions", () => {
  it.each([
    ["move a hand-made -H key", "Move CON-H004 to verified", [["move_proposal", { key: "CON-H004", to: "verified" }]]],
    ["add a task", "Add a task to CON-017: Draft the template", [["add_proposal_task", { key: "CON-017", title: "Draft the template" }]]],
    ["make me the owner", `Make me (user id ${A}) the owner of CON-016`, [["update_proposal", { key: "CON-016", ownerUserId: A }]]],
    ["accept", `Accept the suggestion "Move CON-H004 to Verified" (suggestion id ${B})`, [["accept_agent_suggestion", { id: B }]]],
    ["dismiss", `Dismiss the suggestion "Make Maya Fernando the owner of CON-016" (suggestion id ${C})`, [["dismiss_agent_suggestion", { id: C }]]],
    ["undo", `Undo the suggestion "Move CON-H004 to Verified" (suggestion id ${B})`, [["undo_agent_suggestion", { id: B }]]],
  ])("%s", (_n, ask, want) => expect(calls(ask)).toEqual(want));

  it.each([
    ["an empty task title", "Add a task to CON-017: "],
    ["a suggestion with no id", `Accept the suggestion "Move CON-H004 to Verified"`],
    ["owner without an id", "Make me the owner of CON-016"],
  ])("does nothing for %s", (_n, ask) => expect(scriptedWrite(ask) ?? []).toEqual([]));
});

// 081 amendment 3: every Delivery pin's offer, as the e2e chat model takes it.
describe("081 scripted Delivery pin offers", () => {
  it.each([
    ["new proposal in a project", "Add a proposal to Contoso Portal (CON): Dunning emails", [["create_proposal", { projectKey: "CON", title: "Dunning emails" }]]],
    ["081 amendment 6 new proposal with an owner", `Add a proposal to Contoso Portal (CON): Dunning emails, owned by Nimal Silva (user id ${A})`, [["create_proposal", { projectKey: "CON", title: "Dunning emails", ownerUserId: A }]]],
    ["084 a question with quick replies", "Ask which project for Export invoices", [["offer_answers", { question: "Which project is it for?", answers: ["CON · Contoso Portal", "FLT · Fleet Tracker"] }]]],
    ["081 amendment 6 someone else as owner", `Make Kasun Dias (user id ${A}) the owner of CON-018`, [["update_proposal", { key: "CON-018", ownerUserId: A }]]],
    ["next release", "Create release v2.6.0 of CON", [["create_release", { projectKey: "CON", version: "v2.6.0" }]]],
    ["mark a task done", "Mark T2 of CON-014 done", [["mark_task_done", { key: "CON-014", task: "T2" }]]],
    ["reopen a task (amendment 5)", "Reopen T1 of CON-018", [["reopen_task", { key: "CON-018", task: "T1" }]]],
    ["withdraw, with the reason typed on (amendment 4)", "Withdraw CON-018. Reason: not needed any more", [["withdraw_proposal", { key: "CON-018", reason: "not needed any more" }]]],
    ["link a repo with its branch", "Link FLT's repo to https://github.com/example/fleet-tracker on main", [["link_project_repo", { projectKey: "FLT", repoUrl: "https://github.com/example/fleet-tracker", defaultBranch: "main" }]]],
    ["relink without a branch", "Link CON's repo to https://github.com/example/contoso-portal", [["link_project_repo", { projectKey: "CON", repoUrl: "https://github.com/example/contoso-portal" }]]],
    ["unlink", "Unlink CON's repo", [["unlink_project_repo", { projectKey: "CON" }]]],
    ["new project", "Create a project: Atlas Portal (ATL) for Example Co, t&m", [["create_project", { name: "Atlas Portal", key: "ATL", client: "Example Co", billing: "t&m" }]]],
  ])("%s", (_n, ask, want) => expect(calls(ask)).toEqual(want));

  it.each([
    ["a release with no version", "Create release of CON"],
    ["a task without a number", "Mark T of CON-014 done"],
    ["a link with no url", "Link FLT's repo to "],
    ["a project with no billing", "Create a project: Atlas (ATL) for Example Co"],
  ])("does nothing for %s", (_n, ask) => expect(scriptedWrite(ask) ?? []).toEqual([]));
});
