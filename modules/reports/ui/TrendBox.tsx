import type { Group } from "../server/roster";
import type { ViewData } from "./data";
import { GROUPS, LINE } from "./trendMath";
import type { Spot } from "./useTrendSpot";

function Score({ v, target }: { v: number | null; target: number }) {
  if (v === null) return <><b className="sv" style={{ display: "block" }}>–</b><span className="su">no hours</span></>;
  const x = v - target;
  return <><b className={`sv ${x >= 0 ? "good" : "warnc"}`} style={{ display: "block" }}>{v}%</b><span className="su">{x >= 0 ? "+" : "−"}{Math.abs(x)} pts {x >= 0 ? "above" : "below"}</span></>;
}

export function TrendBox({ d, group, spot }: { d: ViewData; group: Group; spot: Spot | null }) {
  return (
    <div className={spot ? "sb on" : "sb"} role="status" style={spot ? { left: spot.left, top: spot.top } : undefined}>
      {spot && (
        <>
          <div className="sh"><span className="mo">{d.months[spot.k]}{spot.k === d.months.length - 1 ? " · to date" : ""}</span><span className="tag">target {d.target}%</span></div>
          <div className="scs">
            {GROUPS.map((g) => (
              <div className="sc" key={g}><span className="sl"><u className="dot" style={{ background: LINE[g].c }} />{d.sides[g].label}{g === group && <i>selected</i>}</span><Score v={d.sides[g].trend[spot.k]} target={d.target} /></div>
            ))}
          </div>
          <div className="f">{d.sides[group].label} is the thick line</div>
        </>
      )}
    </div>
  );
}
