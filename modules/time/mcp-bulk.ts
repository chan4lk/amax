import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import { tool } from "./mcp-kit";
import { approveMany, remindMany } from "./server/bulk";
import { bulkCard, proposeBulk } from "./server/bulk-card";
import { ctxFor } from "./server/context";

// 070 amendment 4: several people's weeks in one confirm card, with a result per person.
const weekIds = z.array(z.uuid()).min(1).max(50).describe("The week ids from get_team_week, one per person");

export const bulkTools: McpToolDef[] = [
  tool({ name: "remind_weeks", description: "Remind several people at once to submit their timesheets (draft or sent-back weeks), in one confirm card; prefer this over remind_week for more than one person. Take the week ids from get_team_week. Each person is reminded in their own step, and the result says who was reminded, skipped or failed.",
    scope: "write", permission: "time:approve", input: z.object({ weekIds }), propose: proposeBulk("remind"), card: bulkCard("remind"), service: remindMany, run: (v, a, s = "mcp") => remindMany(ctxFor(v, s), a) }),
  tool({ name: "approve_weeks", description: "Approve several submitted timesheets at once, in one confirm card; prefer this over approve_week for more than one person. Take the week ids from get_team_week. Each week is approved in its own step; one that is no longer submitted, or is your own, is skipped.",
    scope: "write", permission: "time:approve", input: z.object({ weekIds }), propose: proposeBulk("approve"), card: bulkCard("approve"), service: approveMany, run: (v, a, s = "mcp") => approveMany(ctxFor(v, s), a) }),
];
