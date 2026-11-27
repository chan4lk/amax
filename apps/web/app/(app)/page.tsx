import type { ActivityItem } from "@amax/core";
import { can, type Viewer } from "@amax/auth";
import { logError } from "@amax/core/server";
import { Card, EmptyState } from "@amax/ui";
import { ActivityFeed } from "../../components/overview/ActivityFeed";
import { Panel } from "../../components/overview/Panels";
import { StatTickets } from "../../components/overview/StatTickets";
import { WaitingTable } from "../../components/overview/WaitingTable";
import { gatherOverview, type OverviewData } from "../../lib/overview";
import { installed } from "../../lib/registry";
import { getViewer } from "../../lib/viewer";
import "./overview.css";

export const metadata = { title: "Overview" };

// 008 AC-4: every installed module's newest activity the viewer may read, merged newest first. A
// module whose feed fails is left out and logged, never shown as "nothing happened".
async function activity(viewer: Viewer): Promise<ActivityItem[]> {
  const feeds = installed.filter((m) => m.activity && can(viewer, `${m.id}:read`));
  const lines = await Promise.all(feeds.map((m) => m.activity!(viewer as never, 8).catch((e: unknown) => (logError(`overview.activity ${m.id}`, e), []))));
  return lines.flat().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
}

const EMPTY: OverviewData = { tickets: [], waiting: [], panels: [], ledes: [], failed: [] };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  const raw = await searchParams;
  const query = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const [items, data] = viewer ? await Promise.all([activity(viewer), gatherOverview(viewer, query)]) : [[], EMPTY];
  const side = data.panels.filter((p) => p.slot === "aside");
  const main = data.panels.filter((p) => p.slot === "main");
  const blank = !items.length && !data.tickets.length && !data.panels.length && !data.waiting.length;
  return (
    <>
      <h1>Delivery overview</h1>
      <p className="lede">{data.ledes.length ? data.ledes.join(" ") : "Agents keep the records here: hours, proposals, releases and the decisions waiting on you."}</p>
      {data.failed.length > 0 && <div className="card overview-failed" role="status">Couldn&apos;t load {data.failed.join(", ")}. Those blocks are left out rather than shown as zero.</div>}
      {blank ? (
        <Card>
          <EmptyState icon="home" title="Nothing to show yet" hint="Activity shows here once agents, pipelines or people record work. Until then, open any installed module from the rail." />
        </Card>
      ) : (
        <div className="overview-cols">
          <div className="stack">
            <StatTickets tickets={data.tickets} />
            {main.map((p) => <Panel key={p.key} panel={p} />)}
            {viewer && <WaitingTable items={data.waiting} now={Date.now()} viewerId={viewer.userId} />}
            {items.length > 0 && <ActivityFeed items={items} />}
          </div>
          {side.length > 0 && <aside className="stack">{side.map((p) => <Panel key={p.key} panel={p} />)}</aside>}
        </div>
      )}
    </>
  );
}
