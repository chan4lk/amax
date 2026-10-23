import { can, type Viewer } from "@amax/auth";
import type { ToolCard } from "@amax/core";
import { refuse } from "./card";
import { mayDecide } from "./decide";
import { read } from "./read";
import { keyOf, peekWeek, weekHours, type MayAct, type WeekRef, type WeekRow } from "./weeks";

// 070 amendment 2: week cards name the person, the week and its hours, and a week that can't take the
// decision gets no card. The services keep these same checks at run time.
type Kind = "approve" | "reject" | "remind" | "reopen";
type Args = WeekRef & { comment?: string; reason?: string };

const blocked: Record<Kind, (w: WeekRow, v: Viewer) => string | null> = {
  approve: (w) => (w.status === "submitted" ? null : `${keyOf(w)} is ${w.status}, not submitted`),
  reject: (w) => (w.status === "submitted" ? null : `${keyOf(w)} is ${w.status}, not submitted`),
  remind: (w) => (w.status === "draft" || w.status === "rejected" ? null : `${keyOf(w)} is already ${w.status}`),
  reopen: (w, v) => (w.user_id === v.userId ? `${keyOf(w)} is your own week; another Admin has to reopen it`
    : w.status === "approved" ? null : `${keyOf(w)} isn't approved, so it isn't locked`),
};

async function preview(v: Viewer, kind: Kind, a: Args) {
  const found = await read(v, async (tx) => {
    const may: MayAct = kind === "reopen" ? () => can(v, "time:admin") : mayDecide(tx, v);
    const week = await peekWeek(tx, a, may).catch((e: Error) => refuse(e.message));
    return week && { week, hours: Math.round((await weekHours(tx, week.id)) * 10) / 10 };
  });
  if (!found) return refuse("there's no such timesheet you can act on; check the person and week with get_team_week");
  const why = blocked[kind](found.week, v);
  return why ? refuse(why) : found;
}

const titles: Record<Kind, (who: string, key: string, hours: number) => string> = {
  approve: (who, key, hours) => `Approve ${who}'s timesheet for ${key} (${hours} h)`,
  reject: (who, key, hours) => `Send back ${who}'s timesheet for ${key} (${hours} h)`,
  remind: (who, key, hours) => `Remind ${who} to submit ${key} (${hours} h so far)`,
  reopen: (who, key, hours) => `Reopen ${who}'s approved timesheet for ${key} (${hours} h)`,
};

export const proposeWeek = (kind: Kind) => async (v: Viewer, a: Args) => void (await preview(v, kind, a));

export const weekCard = (kind: Kind) => async (v: Viewer, a: Args): Promise<ToolCard> => {
  const { week, hours } = await preview(v, kind, a);
  return { title: titles[kind](week.person_name as string, keyOf(week), hours),
    lines: [...(a.comment ? [{ label: "Comment", value: a.comment }] : []), ...(a.reason ? [{ label: "Reason", value: a.reason }] : [])] };
};
