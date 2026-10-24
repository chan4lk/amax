import { can, type Viewer } from "@amax/auth";

// Reports re-apply each source module's visibility, never wider than it. Hours: Time's hoursVisibleTo (071 AC-13).

// Leave: its owner, their manager, or leave:team in the person's legal entity (leave's own rule).
export const seesLeave = (v: Viewer, p: { userId: string | null; legalEntityId: string }) =>
  (!!p.userId && (p.userId === v.userId || v.reports.includes(p.userId))) || can(v, "leave:team", { legalEntityId: p.legalEntityId });
