import { contextFor } from "@amax/core/server";
import type { JobDef } from "@amax/core";
import { applyStatusDates } from "./services";
import { unzonedLine } from "./zones";

/**
 * Statuses follow joined_on and left_on by each entity's own today, so 'joining' and future leavers don't go stale. 109
 * review round 2: hourly, so each entity moves within the hour after its own midnight; re-running changes nothing.
 */
export const statusDatesJob: JobDef = {
  name: "hr.person.status",
  cron: "5 * * * *",
  async run({ tenantId }) {
    const r = await applyStatusDates(contextFor.job(tenantId, "hr.person.status"), {});
    // 110 AC-3: the zoned entities moved and committed, the run fails naming those it couldn't, so it never reads as clean.
    if (r.unzoned.length) throw new Error(r.unzoned.map(unzonedLine).join("; "));
  },
};
