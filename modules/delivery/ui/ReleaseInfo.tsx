import { PinButton, type PinRef } from "@amax/ui";
import type { ReleaseTracking } from "../server/queries";
import { categoryLabel, dayLabel } from "../server/release-status";
import { StatusChip } from "./ReleaseTable";

/** The completion line: the day stored at completion (128), the one On time or Late was judged by. */
export function completedLine(r: ReleaseTracking) {
  return r.completedAt && r.completedDay ? `Completed on ${dayLabel(r.completedDay)} · ${r.completion === "late" ? "Late" : "On time"}` : null;
}

export function ReleaseInfo({ r, version, projectName, pin }: { r: ReleaseTracking; version: string; projectName: string; pin: PinRef }) {
  const rows: [string, React.ReactNode][] = [["Project", projectName], ["Version", version], ["Category", categoryLabel(r.category) ?? "—"],
    ["Status", <StatusChip key="s" r={r} />], ["Start", dayLabel(r.startDate) ?? "—"], ["Target", dayLabel(r.targetDate) ?? "—"],
    ["Completed", completedLine(r)?.replace("Completed on ", "") ?? <span key="n" className="muted">Not yet</span>]];
  return (
    <div className="card pinnable">
      <div className="card-head"><h2>Release</h2><PinButton inline pin={pin} /></div>
      {!r.category && <p className="muted" style={{ margin: "0 0 10px" }}>This release isn&apos;t tracked yet: it has no category, dates or status.</p>}
      <dl className="rel-info">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </div>
  );
}
