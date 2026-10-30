import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { CardLine, ToolCard } from "@amax/core";
import { getProjectRef } from "@amax/delivery/contracts";
import { dayLabel } from "../week";
import { refuse, storedEntry } from "./card";
import { read } from "./read";
import { dateRefusal } from "./rules";
import { changeText, listRequests, OPEN, type ChangeRequest, type RequestStatus } from "./requests-read";
import { keyOf } from "./weeks";

// 070 amendment 3: the owner's cards for asking, answering and withdrawing, and the checks that keep a
// card from being made for a request that can't go through.
export const asLines = (texts: string[]): CardLine[] => texts.map((t) => { const at = t.indexOf(" "); return { label: t.slice(0, at), value: t.slice(at + 1) }; });

type Ask = { entryId: string; hours?: number; billable?: boolean; note?: string | null; projectKey?: string; remove?: boolean; reason: string };

export async function proposeRequest(v: Viewer, a: Ask) {
  const e = await storedEntry(v, a.entryId);
  if (!e.own) refuse("you can only ask to change your own entries; to fix someone else's, use correct_time_entry on a draft or rejected week");
  if (e.week.status !== "submitted" && e.week.status !== "approved") refuse(`${keyOf(e.week)} is ${e.week.status}, so fix the entry directly with correct_time_entry`);
  const [open] = await read(v, (tx) => tx.execute(sql`select id from time.change_request where entry_id = ${a.entryId} and status in ('pending', 'needs_info')`));
  if (open) refuse(`that entry already has an open change request (request id ${open.id}); check it with get_change_requests`);
  const late = await read(v, (tx) => dateRefusal(tx, e.userId, e.day));
  if (late) refuse(late);
}

export async function requestCard(v: Viewer, a: Ask): Promise<ToolCard> {
  const e = await storedEntry(v, a.entryId);
  const moved = a.projectKey ? (await read(v, (tx) => getProjectRef(tx, a.projectKey!)))?.name ?? a.projectKey : undefined;
  const before = { hours: e.hours, billable: e.billable, note: e.note, projectId: e.projectId, projectName: e.projectName };
  const change = changeText({ kind: a.remove ? "delete" : "correct", before, proposed: { hours: a.hours, billable: a.billable, note: a.note, projectName: moved } });
  const look = { kind: "Change request", figure: a.remove ? "Remove" : a.hours !== undefined ? `${Number(a.hours.toFixed(2))} h` : "Change", subject: e.projectName, detail: dayLabel(e.day), who: "for you", confirm: "Send request", done: `Sent your request · ${e.projectName}, ${dayLabel(e.day)}` };
  return { title: `${a.remove ? "Ask to remove" : "Ask to change"} ${e.projectName}, ${dayLabel(e.day)}`, look, lines: [...asLines(change), { label: "Reason", value: a.reason },
    { label: "Review", value: `${keyOf(e.week)} is ${e.week.status}; nothing changes until an approver decides` }] };
}

/** The viewer's own request, or one they review; anything else is one "no such request" refusal. */
export async function findRequest(v: Viewer, id: string, mine: boolean, statuses: RequestStatus[] = OPEN): Promise<ChangeRequest> {
  const [r] = await listRequests(v, { id, mine });
  if (!r) return refuse("there's no such change request you can act on; list them with get_change_requests");
  if (!statuses.includes(r.status)) refuse(`that request is ${r.status.replace("_", " ")}`);
  return r;
}

const about = (r: ChangeRequest) => `${r.before.projectName}, ${r.dayLabel}`;

export const proposeAnswer = async (v: Viewer, a: { requestId: string }) => void (await findRequest(v, a.requestId, true, ["needs_info"]));
export async function answerCard(v: Viewer, a: { requestId: string; answer: string }): Promise<ToolCard> {
  const r = await findRequest(v, a.requestId, true, ["needs_info"]);
  return { title: `Answer the question about your change to ${about(r)}`, lines: [{ label: "Question", value: r.question ?? "" }, { label: "Answer", value: a.answer }] };
}

export const proposeCancel = async (v: Viewer, a: { requestId: string }) => void (await findRequest(v, a.requestId, true));
export async function cancelCard(v: Viewer, a: { requestId: string }): Promise<ToolCard> {
  const r = await findRequest(v, a.requestId, true);
  return { title: `Withdraw your change request for ${about(r)}`, lines: asLines(changeText(r)) };
}
