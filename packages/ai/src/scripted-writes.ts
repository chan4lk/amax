type Call = [name: string, input: Record<string, unknown>];
type Rule = [RegExp, (m: RegExpMatchArray) => Call[]];

const KEY = "([A-Z][A-Z0-9]{1,9})";
const WEEK = "(\\d{4}-W\\d{2})";
const UUID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
// "Nimal Silva (week id <uuid>), Kasun Dias (week id <uuid>)": every id, or none when any item lacks one.
const weekIds = (list: string) => {
  const item = new RegExp(`\\s*[^,(]+? \\(week id ${UUID}\\)\\s*(?:,|$)`, "iy");
  const ids: string[] = [];
  for (let m = item.exec(list); m; m = item.lastIndex < list.length ? item.exec(list) : null) ids.push(m[1]);
  return ids.length && item.lastIndex === list.length ? ids : [];
};
const names = (list: string) => list.split(/\s*,\s*|\s+and\s+/).filter(Boolean);
const env = (projectKey: string, name: string, more: Record<string, unknown> = {}): Call[] => [["upsert_environment", { projectKey, name, ...more }]];
const DETAIL: Record<string, string> = { title: "title", "next step": "nextStep", competing: "competing", "lead source": "leadSource", service: "service", "cost centre": "costCentre" };

const RULES: Rule[] = [
  [new RegExp(`^submit my timesheet for ${WEEK}`, "i"), (m) => [["submit_week", { week: m[1] }]]],
  [new RegExp(`^(approve|remind) .+?'s timesheet for ${WEEK} \\(week id ${UUID}\\)\\s*$`, "i"), (m) => [[`${m[1].toLowerCase()}_week`, { weekId: m[3] }]]],
  [new RegExp(`^approve the submitted timesheets for ${WEEK}: (.+)$`, "i"), (m) => weekIds(m[2]).map((weekId) => ["approve_week", { weekId }])],
  [new RegExp(`^remind these people to submit their timesheets for ${WEEK}: (.+)$`, "i"), (m) => weekIds(m[2]).map((weekId) => ["remind_week", { weekId }])],
  [new RegExp(`^log time on ${WEEK}: ([\\d.]+) h(?:ours)? on ${KEY} on (\\d{4}-\\d{2}-\\d{2})`, "i"), (m) => [["log_time", { hours: Number(m[2]), projectKey: m[3], day: m[4] }]]],
  [/^copy (.+?) allocations from .*?\((\d{4}-\d{2})\) to the next month/i, (m) => [["copy_allocations_to_next_month", { team: m[1], from: m[2] }]]],
  [new RegExp(`^record a deployment of ${KEY} (\\S+) to (\\S+)\\s*$`, "i"), (m) => [["record_deployment", { projectKey: m[1], version: m[2], environment: m[3] }]]],
  [new RegExp(`^move (${KEY.slice(1, -1)}-H?\\d+) to (proposed|planned|building|verified)\\s*$`, "i"), (m) => [["move_proposal", { key: m[1], to: m[2].toLowerCase() }]]],
  // 081 amendment 2: a proposal's pin suggestions, and deciding an agent suggestion from where it is shown.
  [new RegExp(`^add a task to (${KEY.slice(1, -1)}-H?\\d+): (.+)$`, "i"), (m) => [["add_proposal_task", { key: m[1], title: m[2].trim() }]]],
  [new RegExp(`^make me \\(user id ${UUID}\\) the owner of (${KEY.slice(1, -1)}-H?\\d+)\\s*$`, "i"), (m) => [["update_proposal", { key: m[2], ownerUserId: m[1] }]]],
  [new RegExp(`^(accept|dismiss|undo) the suggestion ".+" \\(suggestion id ${UUID}\\)\\s*$`, "i"), (m) => [[`${m[1].toLowerCase()}_agent_suggestion`, { id: m[2] }]]],
  // 081 amendment 4: the proposal page's Withdraw button, with the reason typed on.
  [new RegExp(`^withdraw (${KEY.slice(1, -1)}-H?\\d+)\\. reason: (.+)$`, "i"), (m) => [["withdraw_proposal", { key: m[1], reason: m[2].trim() }]]],
  // 081 amendment 6: a new proposal with an owner picked from the team, and an owner changed to someone else (test-only, by id).
  [new RegExp(`^add a proposal to .+? \\(${KEY}\\): (.+?), owned by .+? \\(user id ${UUID}\\)\\s*$`, "i"), (m) => [["create_proposal", { projectKey: m[1], title: m[2].trim(), ownerUserId: m[3] }]]],
  [new RegExp(`^make .+? \\(user id ${UUID}\\) the owner of (${KEY.slice(1, -1)}-H?\\d+)\\s*$`, "i"), (m) => [["update_proposal", { key: m[2], ownerUserId: m[1] }]]],
  // 084: quick replies, test-only: the scripted model asks which project with two answers to click.
  [/^ask which project for (.+)$/i, () => [["offer_answers", { question: "Which project is it for?", answers: ["CON · Contoso Portal", "FLT · Fleet Tracker"] }]]],
  // 081 amendment 3: what the other Delivery pins offer.
  [new RegExp(`^add a proposal to .+? \\(${KEY}\\): (.+)$`, "i"), (m) => [["create_proposal", { projectKey: m[1], title: m[2].trim() }]]],
  [new RegExp(`^create release (v?\\d+\\.\\d+\\.\\d+) of ${KEY}\\s*$`, "i"), (m) => [["create_release", { projectKey: m[2], version: m[1] }]]],
  [new RegExp(`^mark (T\\d+) of (${KEY.slice(1, -1)}-H?\\d+) done\\s*$`, "i"), (m) => [["mark_task_done", { key: m[2], task: m[1].toUpperCase() }]]],
  // 081 amendment 5: reopen a task closed by mistake.
  [new RegExp(`^reopen (T\\d+) of (${KEY.slice(1, -1)}-H?\\d+)\\s*$`, "i"), (m) => [["reopen_task", { key: m[2], task: m[1].toUpperCase() }]]],
  [new RegExp(`^link ${KEY}'s repo to (\\S+)(?: on (\\S+))?\\s*$`, "i"), (m) => [["link_project_repo", { projectKey: m[1], repoUrl: m[2], ...(m[3] ? { defaultBranch: m[3] } : {}) }]]],
  [new RegExp(`^unlink ${KEY}'s repo\\s*$`, "i"), (m) => [["unlink_project_repo", { projectKey: m[1] }]]],
  [new RegExp(`^create a project: (.+?) \\(${KEY}\\) for (.+?), (fixed|t&m|retainer|internal)\\s*$`, "i"), (m) => [["create_project", { name: m[1].trim(), key: m[2], client: m[3].trim(), billing: m[4].toLowerCase() }]]],
  [new RegExp(`^tag ${KEY} (\\S+) as (\\S+)\\s*$`, "i"), (m) => [["tag_release", { projectKey: m[1], version: m[2], newVersion: m[3] }]]],
  [new RegExp(`^set the proposals in ${KEY} (\\S+) to: (.*)$`, "i"), (m) => [["set_release_proposals", { projectKey: m[1], version: m[2], proposalKeys: names(m[3]) }]]],
  [new RegExp(`^void the (.+?) deployment of ${KEY} (\\S+) \\(id ([0-9a-f-]{36})\\)\\. reason: (.+)$`, "i"),
    (m) => [["void_deployment", { environment: m[1], projectKey: m[2], version: m[3], deploymentId: m[4], reason: m[5].trim() }]]],
  [new RegExp(`^add an environment to ${KEY}: (.+)$`, "i"), (m) => env(m[1], m[2].trim())],
  [new RegExp(`^rename the (.+?) environment of ${KEY} to (.+)$`, "i"), (m) => env(m[2], m[1], { rename: m[3].trim() })],
  [new RegExp(`^move the (.+?) environment of ${KEY} to position (\\d+)`, "i"), (m) => env(m[2], m[1], { position: Number(m[3]) })],
  [new RegExp(`^make (.+?) the prod environment of ${KEY}`, "i"), (m) => env(m[2], m[1], { isProd: true })],
  [new RegExp(`^unmark (.+?) as the prod environment of ${KEY}`, "i"), (m) => env(m[2], m[1], { isProd: false })],
  [new RegExp(`^remove the (.+?) environment of ${KEY}`, "i"), (m) => [["remove_environment", { projectKey: m[2], name: m[1] }]]],
  [/^change details on (PS-\d{4}): ([a-z ]+?): (.+)$/i, (m) => (DETAIL[m[2].toLowerCase()] ? [["update_opportunity", { number: m[1], [DETAIL[m[2].toLowerCase()]]: m[3].trim() }]] : [])],
];

export function scriptedWrite(ask: string) {
  for (const [re, calls] of RULES) {
    const m = ask.trim().match(re);
    if (m) return calls(m).map(([name, input], i) => ({ type: "tool_use" as const, id: `t${Date.now()}${i}`, name, input }));
  }
  return null;
}
