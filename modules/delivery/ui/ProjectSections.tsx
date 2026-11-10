import type { ReactNode } from "react";
import type { ScreenProps } from "@amax/core";
import { Card, EmptyState, type IconName } from "@amax/ui";
import { PROJECT_SECTIONS, projectHref, type ProjectSection } from "../contracts";
import { projectPin } from "../pins";
import { getProject } from "../server/queries";
import { AskButton } from "./AskButton";
import { needViewer, SignInFirst } from "./parts";

export function ProjectTabs({ projectKey, current }: { projectKey: string; current: ProjectSection }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {PROJECT_SECTIONS.map((s) => (
        <a key={s.path} className="btn sm" href={projectHref(projectKey, s.path)} aria-current={s.path === current ? "page" : undefined}>{s.label}</a>
      ))}
    </nav>
  );
}

export async function ProjectSectionPage({ viewer: raw, params, section, title, children }: ScreenProps & { section: ProjectSection; title: string; children: (p: { id: string; key: string; name: string; repoUrl?: string | null; agentFirst?: boolean }) => ReactNode }) {
  const viewer = needViewer(raw);
  if (!viewer) return <><h1>Project</h1><SignInFirst /></>;
  const data = await getProject(viewer, params.key);
  if (!data) return <><h1>Project not found</h1><p className="lede">No project with the key {params.key}.</p></>;
  const { project } = data;
  return (
    <>
      <nav className="crumb" aria-label="Breadcrumb"><a href="/delivery">Projects</a><span>/</span><a href={projectHref(project.key)}>{project.name}</a><span>/</span>{title}</nav>
      <h1>{project.name}</h1>
      <ProjectTabs projectKey={project.key} current={section} />
      {children(project)}
    </>
  );
}

const pending = (section: ProjectSection, title: string, icon: IconName, arrives: string, ask: string) =>
  function PendingSection(props: ScreenProps) {
    return (
      <ProjectSectionPage {...props} section={section} title={title}>
        {(p) => (
          <Card title={title}>
            <EmptyState icon={icon} title={arrives} hint="This section fills in when that change lands. Until then, amax can answer from what it knows."
              action={<AskButton label={`Ask amax about ${p.name}'s ${ask}`} prompt={`What do we know about the ${ask} on ${p.name} (${p.key})?`} pin={projectPin(p)} />} />
          </Card>
        )}
      </ProjectSectionPage>
    );
  };

export const RisksSection = pending("risks", "Risks and decisions", "target", "Arrives with RAID logs", "risks and decisions");
export const ContractSection = pending("contract", "Contract", "wallet", "Arrives with finance, 017", "contract");
export const TeamSection = pending("team", "Team", "people", "Arrives with allocations, 010", "team");
