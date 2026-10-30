import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { CardLine, ToolCard } from "@amax/core";
import { refuse } from "./card";
import { entityOf } from "./chain";
import { mayAddOn, mayMove } from "./entry";
import { read } from "./read";
import { asLines, findRequest } from "./request-card";
import { changeText, OPEN, type ChangeRequest } from "./requests-read";

// 070 amendment 3: the approver's card for each decision, and the checks that refuse one bound to fail.
type Decide = { requestId: string; decision: "apply" | "reopen" | "ask" | "decline"; note?: string };
const first = (r: ChangeRequest) => r.personName.split(" ")[0];
const about = (r: ChangeRequest) => `${r.before.projectName}, ${r.dayLabel}`;
const locked = (s: string) => s === "submitted" || s === "approved";

async function checked(v: Viewer, a: Decide): Promise<ChangeRequest> {
  const r = await findRequest(v, a.requestId, false, a.decision === "decline" ? OPEN : ["pending"]);
  if (a.decision !== "apply") return r;
  if (!locked(r.weekStatus)) refuse(`${r.week} is ${r.weekStatus} now, so ${first(r)} can fix it directly`);
  if (r.kind === "add") {
    // 073: an addition has no entry yet; it still has to fit the person's 24 h day.
    const [{ total }] = await read(v, (tx) => tx.execute(sql`select coalesce(sum(hours), 0) as total from time.entry where user_id = ${r.userId} and day = ${r.day} and deleted_at is null`));
    if (Number(total) + (r.proposed.hours ?? 0) > 24) refuse(`that would make ${r.dayLabel} more than 24 h for ${first(r)}`);
    if (!mayAddOn(v, r.userId, r.before.projectId, await read(v, (tx) => entityOf(tx, r.userId)))) refuse(`you don't approve ${r.before.projectName}, so you can't add hours to it; reopen the week or decline it`);
    return r;
  }
  const [e] = await read(v, (tx) => tx.execute(sql`select revision from time.entry where id = ${r.entryId} and deleted_at is null`));
  if (!e || Number(e.revision) !== r.revision) refuse(`the entry changed since the request; ask ${first(r)} to request it again`);
  if (!mayMove(v, r, await read(v, (tx) => entityOf(tx, r.userId)))) refuse(`you don't approve ${r.proposed.projectName ?? "the project"} it moves to, so you can't apply it; reopen the week or decline it`);
  return r;
}

export const proposeDecide = async (v: Viewer, a: Decide) => void (await checked(v, a));

const notice = (r: ChangeRequest): CardLine => ({ label: "Notice", value: `${first(r)} will be notified` });
const cards: Record<Decide["decision"], (r: ChangeRequest, note?: string) => ToolCard> = {
  apply: (r) => ({ title: r.kind === "add" ? `Add ${r.personName}'s ${r.proposed.hours} h to ${about(r)}` : `Apply ${r.personName}'s change: ${about(r)}`,
    lines: [...asLines(changeText(r)), { label: "Reason", value: r.reason }, { label: "Week", value: `${r.week} stays ${r.weekStatus}` }, notice(r)] }),
  reopen: (r) => ({ title: `Reopen ${r.personName}'s ${r.week} for their fix`,
    lines: [...asLines(changeText(r)), { label: "Reason", value: r.reason },
      { label: "Week", value: `back to draft for ${first(r)} to fix and resubmit` }, notice(r)] }),
  ask: (r, note) => ({ title: `Ask ${r.personName} about their change to ${about(r)}`, lines: [{ label: "Question", value: note ?? "" }, notice(r)] }),
  decline: (r, note) => ({ title: `Decline ${r.personName}'s change to ${about(r)}`, lines: [...asLines(changeText(r)), { label: "Why", value: note ?? "" }, notice(r)] }),
};

// 073: the decision card leads with the request's change and the person, and its button names the decision.
const figureOf = (r: ChangeRequest) => (r.kind === "add" ? `+${r.proposed.hours} h` : r.kind === "delete" ? "Remove" : r.proposed.hours !== undefined ? `${r.proposed.hours} h` : "Change");
const LOOK: Record<Decide["decision"], [string, string, string]> = { apply: ["Apply change request", "Apply change", "Applied"], reopen: ["Reopen for a fix", "Reopen week", "Reopened for a fix"], ask: ["Ask about a request", "Send question", "Asked"], decline: ["Decline request", "Decline", "Declined"] };

export async function decideCard(v: Viewer, a: Decide): Promise<ToolCard> {
  const r = await checked(v, a);
  const [kind, confirm, did] = LOOK[a.decision];
  return { ...cards[a.decision](r, a.note), look: { kind, figure: figureOf(r), subject: `${r.before.projectName} · ${r.personName}`, detail: r.dayLabel, confirm,
    done: `${did} · ${r.personName}, ${r.before.projectName}, ${r.dayLabel}`, ...(a.decision === "decline" ? { tone: "danger" as const } : {}) } };
}
