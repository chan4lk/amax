"use client";

import { useRouter } from "next/navigation";

// 073 AC-16: read-only controls that only change the URL: project, team and status. The page updates in place and keeps its scroll.
type Props = { projects: string[]; teams: string[] | null; query: Record<string, string | undefined>; base: string };
const STATUSES: [string, string][] = [["", "Any status"], ["not_submitted", "Not submitted"], ["submitted", "Submitted"], ["approved", "Approved"], ["rejected", "Rejected"]];

export function Filters({ projects, teams, query, base }: Props) {
  const router = useRouter();
  const go = (path: string, change: Record<string, string>) => {
    const next = new URLSearchParams(Object.entries({ ...query, ...change }).filter(([, val]) => val) as [string, string][]);
    router.push(`${path}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const pick = (key: string) => (e: { target: { value: string } }) => go(base, { [key]: e.target.value });
  return (
    <div className="toolbar" role="group" aria-label="Filter the timesheets">
      <select aria-label="Project" value={query.project ?? ""} onChange={pick("project")}><option value="">All projects</option>{projects.map((p) => <option key={p}>{p}</option>)}</select>
      {teams && <select aria-label="Team" value={query.team ?? ""} onChange={pick("team")}><option value="">All teams</option>{teams.map((t) => <option key={t}>{t}</option>)}</select>}
      <select aria-label="Status" value={query.status ?? ""} onChange={pick("status")}>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </div>
  );
}
