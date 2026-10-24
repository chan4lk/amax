import type { ScreenProps } from "@amax/core";
import { Card, EmptyState } from "@amax/ui";
import { openToReview } from "../server/requests-read";
import { teamGrid } from "../server/grid";
import { ChangeRequests } from "./ChangeRequests";
import { Head, SignInFirst, viewerOrNull, weekParam, weekHref, weekSpan } from "./parts";
import { ThisWeek } from "./ThisWeek";
import { Summary } from "./Summary";
import { Timesheets } from "./Timesheets";
import { WeekChart } from "./WeekChart";

export async function TeamPage({ viewer: raw, params, searchParams = {} }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="time"><h1>Team time</h1><SignInFirst /></div>;
  // 073 amendment 1: the grid's filters and sort live in the URL (read-only controls).
  const query = { project: searchParams.project, team: searchParams.team, status: searchParams.status, sort: searchParams.sort, dir: searchParams.dir };
  const [t, requests] = await Promise.all([teamGrid(viewer, weekParam(params.week), query), openToReview(viewer)]);
  const base = params.week ? `/time/w/${params.week}` : "/time";
  const total = t.rows.reduce((n, r) => n + r.total, 0);
  const agent = t.rows.reduce((n, r) => n + r.agentHours, 0);
  const sent = t.rows.filter((r) => r.status === "submitted" || r.status === "approved");
  const lede = `${weekSpan(t.week, t.days)}. ${sent.length} of ${t.rows.length} people have submitted ${sent.reduce((n, r) => n + r.total, 0).toFixed(1)} h. `
    + `Agents logged ${agent.toFixed(1)} h, ${total ? Math.round((agent / total) * 100) : 0}% of the team's ${total.toFixed(1)} h.`;
  return (
    <div className="time">
      <Head title="Team time" lede={t.rows.length ? lede : `${weekSpan(t.week, t.days)}.`} week={t.week} days={t.days} base="" />
      {requests.length > 0 && <ChangeRequests rows={requests} viewerId={viewer.userId} />}
      {t.rows.length === 0 && t.grid.length === 0 && !Object.values(query).some(Boolean) ? (
        <Card><EmptyState icon="clock" title="No timesheets come to you this week" hint="You see the weeks of people who report to you or who logged time on projects you manage." action={<a className="btn" href={weekHref("/my", t.week)}>Open my timesheet</a>} /></Card>
      ) : (
        <>
          <Summary g={t} />
          <div className="cols">
            <WeekChart perDay={t.perDay} days={t.days} people={t.rows.length} week={t.key} />
            <ThisWeek rows={t.rows} projects={t.projects} week={t.key} capacity={t.capacity} />
          </div>
          <Timesheets g={t} base={base} />
        </>
      )}
    </div>
  );
}
