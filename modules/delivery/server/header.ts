import type { Viewer } from "@amax/auth";
import { getProject, listEnvironments } from "./queries";

type Sprint = { sprint: string | null; sprintStart: string | null; sprintEnd: string | null };

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");

export function projectLede(p: Sprint, envs: readonly { name: string; isProd: boolean }[]) {
  const when = p.sprintStart && p.sprintEnd ? ` runs ${day(p.sprintStart)} to ${day(p.sprintEnd)}` : "";
  const sprint = p.sprint ? `${p.sprint}${when}. ` : "";
  return `${sprint}Released means it reached ${envs.find((e) => e.isProd)?.name ?? "Prod"}.`;
}

export async function projectHeader(viewer: Viewer, key: string) {
  const data = await getProject(viewer, key);
  if (!data) return null;
  return { project: data.project, lede: projectLede(data.project, await listEnvironments(viewer, data.project.key)) };
}
