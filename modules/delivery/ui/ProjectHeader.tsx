import type { ReactNode } from "react";
import { PROJECT_SECTIONS, projectHref, type ProjectHeaderData, type ProjectSection } from "../contracts";
import { AgentFirstLine } from "./AgentFirstLine";
import "./delivery.css";

export type HeaderProject = ProjectHeaderData["project"];

export function ProjectTabs({ projectKey, current }: { projectKey: string; current: ProjectSection }) {
  return (
    <nav className="tabs" aria-label="Sections">
      {PROJECT_SECTIONS.map((s) => (
        <a key={s.path} className="btn sm" href={projectHref(projectKey, s.path)} aria-current={s.path === current ? "page" : undefined}>{s.label}</a>
      ))}
    </nav>
  );
}

export function ProjectHeader({ project, lede, section, title, actions }: { project: HeaderProject; lede: string; section: ProjectSection; title?: string; actions?: ReactNode }) {
  return (
    <div className="dv-head">
      <nav className="crumb" aria-label="Breadcrumb">
        <a href="/delivery">Projects</a><span>/</span>
        {section ? <><a href={projectHref(project.key)}>{project.name}</a><span>/</span>{title}</> : project.name}
      </nav>
      <div className="row head">
        <div>
          <div className="dv-title"><h1>{project.name}</h1>{project.agentFirst && project.repoUrl && <AgentFirstLine repoUrl={project.repoUrl} />}</div>
          <p className="lede">{lede}</p>
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
      <ProjectTabs projectKey={project.key} current={section} />
    </div>
  );
}
