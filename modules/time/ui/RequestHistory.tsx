// 077 amendment 2: the Requests page is the one home for request cards. A week page only says how many decided requests
// it has and links there, filtered to the week: the owner's own (Mine), or that person's, which the viewer reviews (To review).
export function RequestHistory({ count, week, person }: { count: number; week: string; person?: string }) {
  if (!count) return null;
  const href = `/time/requests?${new URLSearchParams(person ? { lens: "review", week, person } : { lens: "mine", week })}`;
  return (
    <p className="rq-history-link">
      <span>{count} decided {count === 1 ? "request" : "requests"} on this week</span>
      <a href={href}>See in Requests<span aria-hidden="true"> →</span></a>
    </p>
  );
}
