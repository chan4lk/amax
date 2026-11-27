// Chat intents (005): a create button marked with an intent opens the chat in that mode. `tool`
// names the MCP write tool the chat fills in; it runs only after the user confirms.
export const chatIntents = [
  // 106: one card the person fills in, shown in the first reply; nothing is asked in text first.
  { id: "delivery.new-project", label: "New project", tool: "set_up_project", required: [],
    fields: [{ name: "name", ask: "Don't ask: call set_up_project at once with the name, key, client, billing and repo the message or pins give; the card asks for the rest." },
      { name: "billing", ask: "Don't ask; the card offers fixed, t&m, retainer and internal.", options: ["fixed", "t&m", "retainer", "internal"] }] },
  { id: "delivery.new-proposal", label: "New proposal", tool: "create_proposal", required: ["projectKey", "title"],
    fields: [{ name: "projectKey", ask: "Which project? (When a project is pinned or named, it's that one: use its key and don't ask. Otherwise call list_projects with mine true. Leave out every project with agentFirst true (its proposals come from its repo; create_proposal refuses them), in every list here (093). Two or more: offer_answers with \"Which project is it for?\" and up to six answers \"<KEY> · <Name>\" (the project key, e.g. \"CON · Contoso Portal\"). Exactly one: offer_answers with that one and \"Another project\". None, or the user picks Another project: call list_projects without mine and offer up to six of the active projects they may add proposals to (not one already offered). Never pick the project for them.)" }, { name: "title", ask: "What's the change?" }, { name: "description", ask: "Anything to add about it, in a sentence or two? (optional)" }, { name: "estimateHours", ask: "Roughly how many hours? (optional)" },
      // 081 AC-69: the owner, picked on a choice card from the project's team, the creator first. AC-78, AC-79: only this
      // month's team (the people AC-67 accepts), each with their spare capacity.
      { name: "ownerUserId", ask: "Who owns it? Always settle this before the card, even though it defaults to the user; skip it only if they already named an owner or said me. Once the project and title are known, call get_project_team for the project, then call offer_choices with the question \"Who owns it?\": one create_proposal option per owner, the same input each time, first \"Me\" (no ownerUserId), then up to three people from the team with a userId who aren't the user and are on the project this month (their first percent above 0; nobody allocated only in later months), most allocated first; label \"<name> · <role> · <freeThisMonth>% free this month\", or \"· fully allocated\" when freeThisMonth is 0, or \"· over-allocated by <n>%\" when it is below 0, or no capacity part when it is null; ownerUserId their userId. With no one else on the team, or no team you can read, don't ask: the owner is the user." }] },
  { id: "delivery.new-release", label: "New release", tool: "create_release", required: ["projectKey"],
    fields: [{ name: "projectKey", ask: "Which project? (a pinned or named one is that one; don't ask)" }, { name: "name", ask: "Don't ask: the card has the name, category, dates and proposals." }] },
  { id: "delivery.link-repo", label: "Link a repo", tool: "link_project_repo", required: ["projectKey"],
    fields: [{ name: "projectKey", ask: "Which project? (a pinned or named one is that one; don't ask)" }, { name: "repoUrl", ask: "Don't ask: the card has the repo and branch fields." }] },
  { id: "delivery.deploy", label: "Record a deployment", tool: "record_deployment", required: ["projectKey", "version", "environment"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "version", ask: "Which release version?" }, { name: "environment", ask: "Which environment, e.g. Dev, QA, UAT or Prod?" }] },
  { id: "delivery.tag-release", label: "Change a release", tool: "set_release_proposals", required: ["projectKey", "version", "proposalKeys"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "version", ask: "Which release?" }, { name: "proposalKeys", ask: "Which proposals should it contain?" }] },
];
