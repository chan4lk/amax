import { z } from "zod";
import { read, tool } from "./mcp-kit";
import { ctxFor } from "./server/context";
import { getSettings, proposeSettings, setSettings, settingsCard } from "./server/settings";

// 071 AC-9: the tenant's entry rules. Every default reproduces Time before 071.
export const settingsTools = [
  tool({ ...read, pin: "view", name: "get_time_settings", description: "The timesheet rules: whether time may only be logged to allocated projects, how many weeks back it may be logged, and whether future dates are allowed.",
    input: z.object({}), run: (v) => getSettings(v) }),
  tool({ name: "set_time_settings", description: "Change the timesheet rules (Admin): requireAllocation (log only to projects the person is allocated to that month), backdateWeeks (1–52, or null for no limit), allowFuture.", scope: "write", permission: "time:admin",
    input: z.object({ requireAllocation: z.boolean().optional(), backdateWeeks: z.number().int().min(1).max(52).nullable().optional(), allowFuture: z.boolean().optional() }),
    propose: proposeSettings, card: settingsCard, service: setSettings, run: (v, a, s = "mcp") => setSettings(ctxFor(v, s), a) }),
];
