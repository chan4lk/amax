/** 093 AC-1, 094 AC-8: where agent-first proposals come from: one project's repo, or "your repos" across projects. */
export function AgentFirstLine({ repoUrl }: { repoUrl?: string }) {
  return (
    <span className="chip dv-agent-first">
      Proposals come from {repoUrl ?? "your repos"} · write one with <code>/specclaw:propose</code>; it appears here when merged
    </span>
  );
}
