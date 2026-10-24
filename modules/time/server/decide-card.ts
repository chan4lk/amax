import { sql } from "drizzle-orm";
import type { Viewer } from "@amax/auth";
import type { CardLine, ToolCard } from "@amax/core";
import { refuse } from "./card";
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
  const [e] = await read(v, (tx) => tx.execute(sql`select revision from time.entry where id = ${r.entryId} and deleted_at is null`));
  if (!e || Number(e.revision) !== r.revision) refuse(`the entry changed since the request; ask ${first(r)} to request it again`);
  return r;
}

export const proposeDecide = async (v: Viewer, a: Decide) => void (await checked(v, a));

const notice = (r: ChangeRequest): CardLine => ({ label: "Notice", value: `${first(r)} will be notified` });
const cards: Record<Decide["decision"], (r: ChangeRequest, note?: string) => ToolCard> = {
  apply: (r) => ({ title: `Apply ${r.personName}'s change: ${about(r)}`,
    lines: [...asLines(changeText(r)), { label: "Reason", value: r.reason }, { label: "Week", value: `${r.week} stays ${r.weekStatus}` }, notice(r)] }),
  reopen: (r) => ({ title: `Reopen ${r.personName}'s ${r.week} for their fix`,
    lines: [...asLines(changeText(r)), { label: "Reason", value: r.reason },
      { label: "Week", value: `back to draft for ${first(r)} to fix and resubmit` }, notice(r)] }),
  ask: (r, note) => ({ title: `Ask ${r.personName} about their change to ${about(r)}`, lines: [{ label: "Question", value: note ?? "" }, notice(r)] }),
  decline: (r, note) => ({ title: `Decline ${r.personName}'s change to ${about(r)}`, lines: [...asLines(changeText(r)), { label: "Why", value: note ?? "" }, notice(r)] }),
};

export async function decideCard(v: Viewer, a: Decide): Promise<ToolCard> {
  return cards[a.decision](await checked(v, a), a.note);
}
