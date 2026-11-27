import type { ProjectHeaderSlot } from "../contracts";
import { projectHeader } from "../server/header";
import { ProjectHeader } from "./ProjectHeader";

export const projectHeaderSlot: ProjectHeaderSlot = {
  load: projectHeader,
  Header: ({ head, section, title, actions }) => <ProjectHeader project={head.project} lede={head.lede} section={section} title={title} actions={actions} />,
};
