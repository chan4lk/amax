import { canEver, type Viewer } from "@amax/auth";
import { PinButton } from "@amax/ui";
import { unzonedLine } from "../server/zones";
import { entityPin } from "../pins";
import { AskButton } from "./AskButton";

/** 110 AC-3: what needs attention first: each entity with no time zone, with the fix asked of amax by someone who may set it. */
export function NoZoneLines({ viewer, entities }: { viewer: Viewer; entities: { id: string; name: string }[] }) {
  if (!entities.length) return null;
  const admin = canEver(viewer, "workflows:admin");
  return (
    <div className="card pinnable" role="region" aria-label="Needs attention" style={{ borderLeft: "4px solid #d97706", marginBottom: 20 }}>
      <div className="card-head"><h2>Needs attention</h2></div>
      {entities.map((e) => {
        const pin = entityPin(e);
        return (
          <p key={e.id} style={{ margin: "0 0 10px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span><b>{unzonedLine(e.name)}</b></span>
            <PinButton inline pin={pin} />
            {admin && <AskButton className="btn sm primary" label="Ask amax · Set the time zone" prompt={`Set the time zone for ${e.name} to `} pin={pin} name={`Ask amax to set the time zone for ${e.name}`} />}
          </p>
        );
      })}
    </div>
  );
}
