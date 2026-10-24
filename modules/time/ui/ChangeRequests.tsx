import type { ChangeRequest } from "../server/requests-read";
import { MyRequest } from "./MyRequest";
import { ReviewRequest } from "./ReviewRequest";
import { reviewOrder } from "./request-view";

export { requestPin } from "./request-view";

// 070 amendment 3, 073: open change requests the viewer reviews, one item each with the person's answer when they've
// given one. Decisions are made in chat, on a confirm card.
export function ChangeRequests({ rows, viewerId }: { rows: ChangeRequest[]; viewerId: string }) {
  const answered = rows.filter((r) => r.status === "pending" && r.answer).length;
  return (
    <div className="card pinnable requests" style={{ margin: "28px 0" }}>
      <div className="card-head">
        <h2>Change requests</h2><span className="chip">{rows.length} open</span>
        {answered > 0 && <span className="chip good">{answered} answered</span>}
      </div>
      <ul className="rq-list">{[...rows].sort(reviewOrder).map((r) => <ReviewRequest key={r.id} r={r} viewerId={viewerId} />)}</ul>
    </div>
  );
}

// 073: the owner's requests on My timesheet, one card each (`MyRequest`).
export function MyRequests({ rows }: { rows: ChangeRequest[] }) {
  return <>{rows.map((r) => <MyRequest key={r.id} r={r} />)}</>;
}
