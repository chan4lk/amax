import type { ChangeRequest } from "../server/requests-read";
import type { TeamRow } from "../server/team";

// The Ask amax prompts for Team time (057). Each names the exact person-week by its id, so chat
// acts on that record and never has to turn a display name back into a week.
type Who = Pick<TeamRow, "weekId" | "personName">;
const one = (r: Who) => `${r.personName} (week id ${r.weekId})`;

export const decidePrompt = (verb: "Approve" | "Remind", r: Who, week: string) => `${verb} ${r.personName}'s timesheet for ${week} (week id ${r.weekId})`;
export const approveAllPrompt = (rows: Who[], week: string) => `Approve the submitted timesheets for ${week}: ${rows.map(one).join(", ")}`;
// 070 amendment 3: the request is named by its id, so chat decides on exactly that one.
export const reviewPrompt = (r: Pick<ChangeRequest, "id" | "personName" | "dayLabel" | "before">) =>
  `Review ${r.personName}'s change request for ${r.before.projectName}, ${r.dayLabel} (request id ${r.id}): `;
// 073: Not started people have no week id yet; they are named by user id, with the week they owe.
type Owed = Who | { weekId: null; personName: string; userId: string };
const owed = (r: Owed) => (r.weekId ? one(r as Who) : `${r.personName} (no timesheet yet, user id ${(r as { userId: string }).userId})`);
export const remindAllPrompt = (rows: Owed[], week: string) => `Remind these people to submit their timesheets for ${week}: ${rows.map(owed).join(", ")}`;
export const notStartedPrompt = (name: string, userId: string, week: string) => `Remind ${name} to submit their timesheet for ${week} (no timesheet yet, user id ${userId})`;
