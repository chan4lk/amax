import type { ChangeRequest } from "../server/requests-read";
import { ExpandAll } from "./ExpandAll";
import { MyRequest } from "./MyRequest";
import { ReviewRequest } from "./ReviewRequest";
import { reviewOrder } from "./request-view";

export { requestPin } from "./request-view";

// 070 amendment 3, 073: open change requests the viewer reviews, one item each with the person's answer when they've
// given one. Decisions are made in chat, on a confirm card. With three or more, only the first (it waits on the
// reviewer) starts open, and "Expand all" opens the rest.
export function ChangeRequests({ rows, viewerId }: { rows: ChangeRequest[]; viewerId: string }) {
  const answered = rows.filter((r) => r.status === "pending" && r.answer).length;
  const many = rows.length > 2;
  return (
    <div className="card requests" style={{ margin: "28px 0" }}>
      <div className="card-head">
        <h2>Change requests</h2><span className="chip">{rows.length} open</span>
        {answered > 0 && <span className="chip good">{answered} answered</span>}
        {many && <ExpandAll label="change requests" />}
      </div>
      <ul className="rq-list">{[...rows].sort(reviewOrder).map((r, i) => <ReviewRequest key={r.id} r={r} viewerId={viewerId} open={!many || i === 0} />)}</ul>
    </div>
  );
}

// 073: the owner's requests on My timesheet, one card each. With more than one, those waiting on the owner start open.
export function MyRequests({ rows }: { rows: ChangeRequest[] }) {
  const many = rows.length > 1;
  return (
    <div className="rq-group">
      {rows.length > 2 && <div className="rq-group-head"><ExpandAll label="your change requests" /></div>}
      {rows.map((r) => <MyRequest key={r.id} r={r} open={!many || r.status === "needs_info"} />)}
    </div>
  );
}
