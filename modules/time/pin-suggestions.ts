import type { PinSuggestion } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { notStartedIn } from "./server/not-started";
import { read } from "./server/read";
import { getTimesheet } from "./server/sheet";
import { decidePrompt, notStartedPrompt } from "./ui/prompts";

// 073: Team time's rows carry only their pin; pinning one offers the action that fits that person, so approving a
// flagged week or reminding one person is two clicks (+, then the suggestion) with nothing to type.
const first = (name: string) => name.split(/\s+/)[0];
const str = (x: unknown) => (typeof x === "string" ? x : null);

export const pinSuggestions: PinSuggestion[] = [
  { tool: "get_timesheet", suggest: (async (v: Viewer, args: Record<string, unknown>) => {
    const weekId = str(args.weekId);
    if (!weekId || args.project) return [];
    const s = (await getTimesheet(v, { weekId })) as { week: string; personName?: string; status?: string; canApprove?: boolean } | null;
    if (!s?.personName || !s.canApprove) return [];
    const who = { weekId, personName: s.personName };
    if (s.status === "submitted") return [{ label: `Approve ${first(s.personName)}'s timesheet`, prompt: decidePrompt("Approve", who, s.week), tool: "approve_week" }];
    if (s.status === "draft" || s.status === "rejected") return [{ label: `Remind ${first(s.personName)}`, prompt: decidePrompt("Remind", who, s.week), tool: "remind_week" }];
    return [];
  }) as PinSuggestion["suggest"] },
  { tool: "get_team_week", suggest: (async (v: Viewer, args: Record<string, unknown>) => {
    const week = str(args.week), userId = str(args.userId);
    if (!week || !userId) return [];
    const [p] = await read(v, (tx) => notStartedIn(tx, v, week, [userId]));
    return p?.ok ? [{ label: `Remind ${first(p.name)}`, prompt: notStartedPrompt(p.name, userId, week), tool: "remind_weeks" }] : [];
  }) as PinSuggestion["suggest"] },
];
