export const chatIntents = [
  { id: "time.log", label: "Log time", tool: "log_time", required: ["projectKey", "hours", "day"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "hours", ask: "How many hours?" }, { name: "day", ask: "Which day (YYYY-MM-DD)? For a Saturday or Sunday, confirm it was weekend work." },
      { name: "billable", ask: "Is it billable to the client?", options: ["yes", "no"] },
      // 081 AC-26 (FR-03), amendment 9 (AC-83, AC-84): settled every time, with quick replies of the likeliest proposals.
      { name: "proposalKey", ask: "Which proposal is it for? Always settle which proposal before the card unless they named one or said none, a proposal is pinned or its page is open (use it), or the entry comes from a commit: call list_proposals with the projectKey and likelyForMe true. No rows: log it with no proposal, without asking. Otherwise always ask, even when one row is clearly likeliest (it goes first): call offer_answers with \"Which proposal is it for?\" and up to five answers \"<proposal key> · <title>\", for example \"CON-014 · Invoice export to PDF\", in the rows' order (likeliest first; their why orders them and isn't shown): always the full proposal key the row gives (CON-014), never just the project key (CON); at most 60 characters, shortening the title, never the key, then \"None\"." }] },
  { id: "time.correct", label: "Fix hours", tool: "correct_time_entry", required: ["entryId"],
    fields: [{ name: "entryId", ask: "Which entry? Pick it from your timesheet." }, { name: "hours", ask: "How many hours should it be?" }] },
  { id: "time.request", label: "Ask for a change", tool: "request_time_change", required: ["entryId", "reason"],
    fields: [{ name: "entryId", ask: "Which entry of your submitted or approved week? Pick it from your timesheet." }, { name: "hours", ask: "What should it be?" }, { name: "reason", ask: "Why is it wrong?" }] },
  // 073: new hours for your own submitted or approved week (weekend work, a forgotten day).
  { id: "time.request-add", label: "Ask to add hours", tool: "request_time_addition", required: ["projectKey", "day", "hours", "reason"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "day", ask: "Which day (YYYY-MM-DD)? For a Saturday or Sunday, confirm it was weekend work." }, { name: "hours", ask: "How many hours?" }, { name: "reason", ask: "Why are they being added now?" }] },
  { id: "time.delete", label: "Remove hours", tool: "delete_time_entry", required: ["entryId"],
    fields: [{ name: "entryId", ask: "Which entry should go? Pick it from your timesheet." }] },
];
