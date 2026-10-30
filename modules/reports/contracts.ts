// The only import surface for other modules (docs/module-standard.md). Insights (026) and the
// Overview read team utilisation here. Reads take the signed-in viewer and count only the people
// whose hours (time), people record (hr) and leave (leave) that viewer may see.
import type { Tx } from "@amax/db";
import type { Viewer } from "@amax/auth";
import { ForbiddenError } from "@amax/core/server";
import { can } from "@amax/auth";
import { utilisationOf } from "./server/figures";
import { loadInputs } from "./server/inputs";

export const EVENTS = { targetSet: "reports.target.set", holidaySet: "reports.holiday.set" } as const;
export type TargetSet = { target: number; by: string };
export type HolidaySet = { legalEntityId: string; on: string; name: string | null; by: string };

/** One person's utilisation over a range. Available is null when their leave isn't visible to the viewer. */
export type PersonUtilisation = {
  userId: string; personId: string; name: string; initials: string; legalEntityId: string;
  contractedHours: number; leaveDays: number | null; leaveLabel: string | null; leaveHidden: boolean;
  availableHours: number | null; loggedHours: number; billableHours: number;
  /** Billable ÷ available, a whole percent. */
  utilisation: number | null;
  /** Some hours' timesheet status couldn't be read (072): no %, and the row stays out of the team figure. */
  hoursIncomplete?: boolean;
};

/**
 * The team over a range: sums over the people counted. `leftOut` is everyone left out; `leaveHidden` of them had leave
 * the viewer can't see, `statusUnknown` had hours whose timesheet status couldn't be read (072). A person with both
 * is counted once in `leftOut` and in each reason.
 */
export type TeamUtilisation = {
  from: string; to: string; people: number; leftOut: number; leaveHidden: number; statusUnknown: number;
  availableHours: number; loggedHours: number; billableHours: number; utilisation: number | null;
};

/** Utilisation (billable ÷ available hours) per person and for the team over a date range, as the viewer sees it. */
export async function utilisation(tx: Tx, viewer: Viewer, range: { from: string; to: string }): Promise<{ rows: PersonUtilisation[]; team: TeamUtilisation }> {
  if (!can(viewer, "reports:read")) throw new ForbiddenError("reports:read", "reports");
  return utilisationOf(await loadInputs(tx, viewer, range), range);
}
