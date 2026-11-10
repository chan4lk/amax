import type { ScreenProps } from "@amax/core";
import { PHASES, projectHref, type Phase } from "../contracts";
import { listProposals, listReleases, today } from "../server/queries";
import { ProjectSectionPage } from "./ProjectSections";
import { ProposalsTable } from "./ProposalsPage";
import { ReleasesCards } from "./ReleasesPage";
import { needViewer } from "./parts";
import { attention, isNeed, suggestedIds } from "../server/attention";
import { AttentionStrip, listQuery, needPin } from "./Attention";
import { AgentFirstLine } from "./AgentFirstLine";

export function ProjectProposals(props: ScreenProps) {
  const viewer = needViewer(props.viewer);
  const phase = (PHASES as readonly string[]).includes(props.params.phase ?? "") ? (props.params.phase as Phase) : undefined;
  const asked = Math.max(1, Number(props.searchParams?.page ?? 1) || 1);
  return (
    <ProjectSectionPage {...props} section="proposals" title="Proposals">
      {async (p) => {
        const mine = props.searchParams?.owner === "me", q = props.searchParams?.q;
        const need = isNeed(props.searchParams?.need) ? props.searchParams.need : undefined;
        const rows = await listProposals(viewer!, { phase, projectKey: p.key, q, ownerUserId: mine ? viewer!.userId : undefined });
        // 081 amendment 11 (AC-96, AC-97): what needs attention, above the table, as on the portfolio list.
        const att = attention(rows, await suggestedIds(viewer!, rows));
        const root = projectHref(p.key, "proposals"), base = phase ? `${root}/${phase}` : root;
        return <>
          {/* 094 AC-8: an agent-first project's Proposals tab says where its proposals come from, as its board does. */}
          {p.agentFirst && p.repoUrl && <div className="actions"><AgentFirstLine repoUrl={p.repoUrl} /></div>}
          <AttentionStrip counts={att.counts} active={need} href={(n) => `${base}${listQuery({ q, owner: mine ? "me" : undefined, need: n })}`} pin={(n) => needPin(n, { projectKey: p.key, projectName: p.name, mine })} />
          <ProposalsTable rows={att.ordered} needs={att.needs} need={need} me={viewer!.userId} phase={phase} root={root} q={q} page={asked} title="Proposals" mine={mine} />
        </>;
      }}
    </ProjectSectionPage>
  );
}

export function ProjectReleases(props: ScreenProps) {
  const viewer = needViewer(props.viewer);
  return (
    <ProjectSectionPage {...props} section="releases" title="Releases">
      {async (p) => {
        const [releases, now] = await Promise.all([listReleases(viewer!, { projectKey: p.key }), today(viewer!)]);
        return <ReleasesCards viewer={viewer!} releases={releases} now={now} root={projectHref(p.key, "releases")} map={props.searchParams?.map} projectKey={p.key} />;
      }}
    </ProjectSectionPage>
  );
}
