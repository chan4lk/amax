import { can, canEver, type Viewer } from "@amax/auth";

/**
 * 085 AC-1, AC-2: whether this person reviews anyone's time, so Time opens on Team time for them. Time's team view
 * (Leadership, Finance), approving everywhere (Admin), or approving on a project they manage or for people who report
 * to them. Everyone else, an engineer most often, opens their own week first.
 */
export function reviewsTime(v: Viewer) {
  if (canEver(v, "time:team") || can(v, "time:approve")) return true;
  if (!canEver(v, "time:approve")) return false;
  return v.reports.length > 0 || v.managedProjects.some((projectId) => can(v, "time:approve", { projectId }));
}
