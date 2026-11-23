import { PinButton } from "@amax/ui";
import { reportPin } from "../pins";
import { availabilityCsv, utilisationCsv } from "../server/csv";
import { shortDay } from "../server/days";
import type { Report } from "../server/view";
import { AvailabilityTable } from "./AvailabilityTable";
import { ExportLink } from "./parts";
import { TabbedCard } from "./TabbedCard";
import { UtilisationTable } from "./UtilisationTable";
import { VIEWS, type ViewKey } from "./views";
import { describe, filtered, type Filter } from "./filter";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export function ReportCard({ r: all, view, filter }: { r: Report; view: ViewKey; filter: Filter }) {
  const r = filtered(all, filter);
  const a = r.availability;
  const showing = describe(filter);
  const left = a.range ? `Rest of ${r.monthName}, ${shortDay(a.range.from)} – ${shortDay(a.range.to)}` : `${r.monthName} has no working days left`;
  const panels = {
    utilisation: {
      name: "Utilisation per person", sub: showing ? <>Showing {showing} · {people(r.rows.length)} · <a href="/reports">show everyone</a></> : `${r.span} · ${people(r.rows.length)}`,
      actions: <ExportLink filename={`utilisation-${r.month}.csv`} csv={utilisationCsv(r)} />,
      pin: <PinButton pin={reportPin(`Utilisation table, ${r.monthName}`, r.month)} />, body: <UtilisationTable r={r} />,
    },
    availability: {
      name: "Availability per person", sub: showing ? <>{left} · showing {showing} · <a href="/reports?view=availability">show everyone</a></> : left,
      actions: <ExportLink filename={`availability-${r.month}.csv`} csv={availabilityCsv(a)} />,
      pin: <PinButton pin={reportPin(`Availability, rest of ${r.monthName}`, r.month)} />, body: <AvailabilityTable r={r} />,
    },
  };
  return <TabbedCard key={`${view}-${filter.band ?? ""}-${filter.find ?? ""}`} initial={view} panels={VIEWS.map((v) => ({ key: v.key, label: v.label, href: v.href, ...panels[v.key] }))} />;
}
