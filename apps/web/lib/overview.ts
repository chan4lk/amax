import type { OverviewPanel, OverviewPart, OverviewQuery, OverviewTicket, OverviewWaiting } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import { listSuggestions, type SuggestionView } from "@amax/agents/server";
import { logError } from "@amax/core/server";
import { installed } from "./registry";

export type OverviewData = { tickets: OverviewTicket[]; waiting: OverviewWaiting[]; panels: OverviewPanel[]; ledes: string[]; failed: string[] };

const fromSuggestion = (s: SuggestionView): OverviewWaiting => ({
  id: `suggestion:${s.id}`, title: s.title, detail: s.detail, context: s.target.label, raisedBy: s.actsFor ? `${s.agent.name} for ${s.actsFor.name.split(" ")[0]}` : s.agent.name,
  agent: true, since: s.createdAt, action: "Review", prompt: `Review this suggestion: ${s.title}`, pin: { label: s.title, tool: "get_agent_suggestion", args: { id: s.id } },
});

// 068 AC-3: open agent suggestions the viewer may decide join the modules' waiting decisions.
const suggestions = (viewer: Viewer) => listSuggestions(viewer, { bucket: "open", limit: 20 })
  .then((list) => ({ m: { title: "Suggestions" }, p: { waiting: list.filter((s) => s.status !== "expired").map(fromSuggestion) } }), (e: unknown) => (logError("overview suggestions", e), { m: { title: "Suggestions" }, p: null }));

// 068 AC-8: every installed module the viewer may read adds its parts. A module whose hook fails is
// logged and named in `failed`, so its blocks show "Couldn't load" instead of zeros.
/** 116 final pass: a nudge (snoozeDays) leads the decisions, so the oldest decisions never cut it off; decisions oldest first. */
export const byAttention = (a: OverviewWaiting, b: OverviewWaiting) => Number(Boolean(b.snoozeDays)) - Number(Boolean(a.snoozeDays)) || a.since.localeCompare(b.since);

export async function gatherOverview(viewer: Viewer, query: OverviewQuery): Promise<OverviewData> {
  const mods = installed.filter((m) => m.overview && can(viewer, `${m.id}:read`));
  const parts = await Promise.all([...mods.map((m) => m.overview!(viewer as never, query).then((p) => ({ m, p }), (e: unknown) => (logError(`overview ${m.id}`, e), { m, p: null }))), suggestions(viewer)]);
  const ok = parts.flatMap(({ p }) => (p ? [p as OverviewPart] : []));
  return {
    tickets: ok.flatMap((p) => p.tickets ?? []).sort((a, b) => a.order - b.order),
    waiting: ok.flatMap((p) => p.waiting ?? []).sort(byAttention),
    panels: ok.flatMap((p) => p.panels ?? []).sort((a, b) => a.order - b.order),
    ledes: ok.flatMap((p) => (p.lede ? [p.lede] : [])),
    failed: parts.filter(({ p }) => !p).map(({ m }) => m.title),
  };
}
