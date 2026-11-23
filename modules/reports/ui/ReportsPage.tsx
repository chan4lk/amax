import type { ScreenProps } from "@amax/core";
import type { Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import { getDeliveryPulse } from "../server/pulse";
import { groupOf } from "../server/roster";
import { getReport } from "../server/view";
import { viewDataOf } from "./data";
import { filterOf } from "./filter";
import { ReportCard } from "./ReportCard";
import { ReportsView } from "./ReportsView";
import { viewOf } from "./views";
import "./reports.css";
import "./look.css";

export async function ReportsPage({ viewer, searchParams }: ScreenProps) {
  const v = (viewer as Viewer | null) ?? null;
  if (!v) return <><h1>Reports</h1><Card><EmptyState icon="chart" title="Sign in to see reports" hint="Utilisation comes from the database once you're signed in." /></Card></>;
  const group = groupOf(v, searchParams?.group);
  const [mine, everyone] = await Promise.all([getReport(v, undefined, "mine"), getReport(v, undefined, "everyone")]);
  const [minePulse, everyonePulse] = await Promise.all([getDeliveryPulse(v, mine), getDeliveryPulse(v, everyone)]);
  const filter = filterOf({ band: searchParams?.band, find: searchParams?.find });
  const view = viewOf(searchParams?.view);
  const params = { view: searchParams?.view, band: searchParams?.band, find: searchParams?.find };
  return (
    <ReportsView d={viewDataOf(mine, minePulse, everyone, everyonePulse)} initial={group} params={params} band={filter.band} find={filter.find}
      tables={{ mine: <ReportCard r={mine} view={view} filter={filter} />, everyone: <ReportCard r={everyone} view={view} filter={filter} /> }} />
  );
}
