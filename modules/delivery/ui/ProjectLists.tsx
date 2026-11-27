import type { ScreenProps } from "@amax/core";
import { PHASES, projectHref, type Phase } from "../contracts";
import { listProposals, listReleases, today } from "../server/queries";
import { ProjectSectionPage } from "./ProjectSections";
import { ProposalsTable } from "./ProposalsPage";
import { ReleasesCards } from "./ReleasesPage";
import { LoadSafe } from "./LoadSafe";
import { listHref } from "../server/release-list";
import { needViewer } from "./parts";
import { attention, isNeed, suggestedIds } from "../server/attention";
import { AttentionStrip, listQuery, needPin } from "./Attention";

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
          <AttentionStrip counts={att.counts} active={need} href={(n) => `${base}${listQuery({ q, owner: mine ? "me" : undefined, need: n })}`} pin={(n) => needPin(n, { projectKey: p.key, projectName: p.name, mine })} />
          <ProposalsTable rows={att.ordered} needs={att.needs} need={need} me={viewer!.userId} phase={phase} root={root} q={q} page={asked} title="Proposals" mine={mine} withProject={false} />
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
        const root = projectHref(p.key, "releases");
        return (
          <LoadSafe what="releases" retry={listHref(root, props.searchParams ?? {})} load={() => Promise.all([listReleases(viewer!, { projectKey: p.key }), today(viewer!)])}>
            {([releases, now]) => <ReleasesCards viewer={viewer!} releases={releases} now={now} root={root} sp={props.searchParams} projectKey={p.key} projectName={p.name} />}
          </LoadSafe>
        );
      }}
    </ProjectSectionPage>
  );
}
