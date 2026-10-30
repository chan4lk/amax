import type { ScreenProps } from "@amax/core";
import { Card, EmptyState, PinButton } from "@amax/ui";
import { requestsPage, type ChangeRequest } from "../server/requests-read";
import { MyRequest } from "./MyRequest";
import { RequestFilters } from "./RequestFilters";
import { ReviewRequest } from "./ReviewRequest";
import { reviewOrder } from "./request-view";
import { SignInFirst, viewerOrNull, Views } from "./parts";
import "./request.css";

// 077: every change request and what came of it, for both sides: Mine (the requests I made) and To review (those I
// decide). Open ones first, then decided, newest first; each row is the request card used elsewhere, with the whole
// exchange. Read-only here: decisions and answers are chat's, from the cards' buttons. Scope is get_change_requests'.
export async function RequestsPage({ viewer: raw, searchParams = {} }: ScreenProps) {
  const viewer = viewerOrNull(raw);
  if (!viewer) return <div className="time"><h1>Requests</h1><SignInFirst /></div>;
  const query = { lens: searchParams.lens, status: searchParams.status, week: searchParams.week, person: searchParams.person };
  const p = await requestsPage(viewer, query);
  const keep = { lens: p.lens, status: query.status, week: query.week, person: p.lens === "review" ? query.person : undefined };
  const lensHref = (lens: string) => `/time/requests?${new URLSearchParams(Object.entries({ lens, status: query.status }).filter((e): e is [string, string] => !!e[1]))}`;
  const pin = { label: p.lens === "mine" ? "My change requests" : "Change requests to review", tool: "get_change_requests", args: { mine: p.lens === "mine" } };
  // Open ones in the order a reviewer works them (reviewOrder); decided ones newest first, as they come.
  const list = (rows: ChangeRequest[], decided = false) => p.lens === "review"
    ? <ul className="rq-list">{(decided ? rows : [...rows].sort(reviewOrder)).map((r) => <ReviewRequest key={r.id} r={r} viewerId={viewer.userId} open={false} />)}</ul>
    : <div className="rq-group">{rows.map((r) => <MyRequest key={r.id} r={r} open={false} />)}</div>;
  const group = (title: string, rows: ChangeRequest[], tone = "") => rows.length > 0 && (
    <section className={`card requests rq-section ${p.lens}`} aria-labelledby={`rq-${title === "Decided" ? "decided" : "open"}`}>
      <div className="card-head"><h2 id={`rq-${title === "Decided" ? "decided" : "open"}`}>{title}</h2><span className={`chip ${tone}`}>{rows.length}</span></div>
      {list(rows, title === "Decided")}
    </section>
  );
  return (
    <div className="time">
      <div className="row head">
        <div className="title"><h1>Requests</h1></div>
        <div className="actions"><Views current="requests" /></div>
      </div>
      <div className="rq-bar pinnable">
        <nav className="seg" aria-label="Whose requests">
          <a href={lensHref("mine")} aria-current={p.lens === "mine" ? "page" : undefined}>Mine{p.counts.mine > 0 && <span className="rq-n">{p.counts.mine}</span>}</a>
          {(p.reviews || p.lens === "review") && <a href={lensHref("review")} aria-current={p.lens === "review" ? "page" : undefined}>To review{p.counts.review > 0 && <span className="rq-n">{p.counts.review}</span>}</a>}
        </nav>
        <RequestFilters query={keep} weeks={p.weeks} people={p.lens === "review" ? p.people : []} />
        <PinButton inline pin={pin} />
      </div>
      {group("Needs attention", p.open, "warn")}
      {group("Decided", p.decided)}
      {p.open.length + p.decided.length === 0 && (
        <Card>
          {p.total
            ? <EmptyState icon="clock" title="No requests match these filters" hint="Try another status or week." action={<a className="btn" href={lensHref(p.lens)}>Clear the filters</a>} />
            : <EmptyState icon="clock" title={p.lens === "mine" ? "You haven't asked for any changes" : "No requests have come to you"} hint={p.lens === "mine" ? "When a submitted or approved week needs a fix, ask amax from My timesheet; it shows here with what your approver decided." : "Requests from people whose weeks you approve show here, open ones first."} />}
        </Card>
      )}
    </div>
  );
}
