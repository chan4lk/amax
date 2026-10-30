"use client";

import { useRouter } from "next/navigation";

// 077: the Requests page's read-only filters: status, person (when there's more than one) and week, kept in the URL with the lens.
type Props = { query: Record<string, string | undefined>; weeks: string[]; people: { id: string; name: string }[] };
const STATUSES: [string, string][] = [["", "All statuses"], ["open", "Open"], ["applied", "Applied"], ["reopened", "Reopened"], ["declined", "Declined"], ["withdrawn", "Withdrawn"]];

export function RequestFilters({ query, weeks, people }: Props) {
  const router = useRouter();
  const pick = (key: string) => (e: { target: { value: string } }) => {
    const next = new URLSearchParams(Object.entries({ ...query, [key]: e.target.value }).filter(([, val]) => val) as [string, string][]);
    router.push(`/time/requests${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return (
    <div className="toolbar" role="group" aria-label="Filter the requests">
      <select aria-label="Status" value={query.status ?? ""} onChange={pick("status")}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      {(people.length > 1 || query.person) && (
        <select aria-label="Person" value={query.person ?? ""} onChange={pick("person")}>
          <option value="">Anyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <select aria-label="Week" value={query.week ?? ""} onChange={pick("week")}>
        <option value="">Any week</option>
        {weeks.map((w) => <option key={w} value={w}>Week {Number(w.slice(-2))}, {w.slice(0, 4)}</option>)}
      </select>
    </div>
  );
}
