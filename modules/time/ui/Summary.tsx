import { PinButton } from "@amax/ui";
import type { TeamGrid } from "../server/grid";

// 073 AC-14: the week at a glance, each figure pinnable to the week it comes from.
export function Summary({ g }: { g: TeamGrid }) {
  const pin = (label: string) => ({ label: `${label}, ${g.key}`, tool: "get_team_week", args: { week: g.key } });
  const stats: [string, string][] = [
    ["Team hours", `${g.summary.hours.toFixed(1)} h`],
    ["Average utilisation", g.summary.utilisation === null ? "–" : `${g.summary.utilisation}%`],
    ["People with missing days", String(g.summary.missingPeople)],
    ["Waiting for your approval", String(g.summary.awaiting)],
  ];
  return (
    <div className="stats" role="list" aria-label="This week's figures">
      {stats.map(([k, value]) => (
        <div className="card pinnable" role="listitem" key={k}><PinButton pin={pin(k)} /><div className="k">{k}</div><div className="big">{value}</div></div>
      ))}
    </div>
  );
}
