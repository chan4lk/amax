export const chatIntents = [
  { id: "time.log", label: "Log time", tool: "log_time", required: ["projectKey", "hours", "day"],
    fields: [{ name: "projectKey", ask: "Which project?" }, { name: "hours", ask: "How many hours?" }, { name: "day", ask: "Which day (YYYY-MM-DD)? For a Saturday or Sunday, confirm it was weekend work." },
      { name: "billable", ask: "Is it billable to the client?", options: ["yes", "no"] }] },
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
