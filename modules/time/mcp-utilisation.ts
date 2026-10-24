import { z } from "zod";
import { isoWeek, read, tool } from "./mcp-kit";
import { ctxFor } from "./server/context";
import { proposeTarget, setTarget, targetCard } from "./server/targets";
import { weekUtilisation } from "./server/utilisation";
import { wantedWeek } from "./server/weeks";

// 072 AC-7 to AC-9: weekly utilisation (hours logged ÷ the person's weekly target) and the targets behind it.
export const utilisationTools = [
  tool({ ...read, pin: "view", name: "get_week_utilisation", description: "Weekly utilisation for an ISO week: per person you may see, hours logged against their weekly target (40 h unless set), the %, overtime above 100% (shown as is), the working days so far with nothing logged, and, with approved leave, the leave-adjusted target and %. Lowest first; `below` (e.g. 80) keeps only those under it. Someone who isn't in the result is someone you may not see: say so plainly and offer the asker's own figure. This is the weekly figure; Reports' get_utilisation is monthly billable utilisation.",
    input: z.object({ week: isoWeek.optional().describe("ISO week such as 2026-W42; the latest week if left out"), below: z.number().min(1).max(200).optional() }),
    run: (v, a) => weekUtilisation(v, wantedWeek(a.week), a.below) }),
  tool({ name: "set_weekly_target", description: "Set a person's weekly target hours for utilisation (Admin), e.g. 24 for a part-time person; hours null goes back to 40.", scope: "write", permission: "time:admin",
    input: z.object({ person: z.string().describe("Name or email"), hours: z.number().min(1).max(60).nullable() }),
    propose: proposeTarget, card: targetCard, service: setTarget, run: (v, a, s = "mcp") => setTarget(ctxFor(v, s), a) }),
];
