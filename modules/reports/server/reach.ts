import type { Viewer } from "@amax/auth";
import { leaveVisibleTo } from "@amax/leave/contracts";

// Reports re-apply each source module's visibility, never wider than it.

// Leave: Leave's own rule, read from its contract so the two never drift (072 review round 1).
export const seesLeave = (v: Viewer, p: { userId: string | null; legalEntityId: string }) => leaveVisibleTo(v, p);
