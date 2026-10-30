import { z } from "zod";
import { tool } from "./mcp-kit";
import { ctxFor } from "./server/context";
import { missingCard, proposeMissing, remindMissing } from "./server/remind-missing";
import { projectRemindersCard, proposeProjectReminders, setProjectReminders } from "./server/project-reminders";

// 073 AC-3: remind everyone with nothing logged on a working day, in one card.
export const reminderTools = [
  tool({ name: "remind_missing", description: "Remind everyone you're responsible for who has logged nothing on a working day (today or an earlier weekday; never a weekend), with an optional message (default \"Please update your hours for today.\"). People on approved leave, or who have logged, are skipped. userIds limits it to some of them.", scope: "write", permission: "time:approve",
    input: z.object({ day: z.string().describe("YYYY-MM-DD, the working day"), message: z.string().optional(), userIds: z.array(z.string().uuid()).optional() }),
    propose: proposeMissing, card: missingCard, service: remindMissing, run: (v, a, s = "mcp") => remindMissing(ctxFor(v, s), a) }),
  tool({ name: "set_project_reminders", description: "Switch the automatic daily timesheet reminder off or on for a project you manage. People whose recent projects are all switched off aren't reminded automatically.", scope: "write", permission: "time:approve",
    input: z.object({ projectKey: z.string(), enabled: z.boolean() }),
    propose: proposeProjectReminders, card: projectRemindersCard, service: setProjectReminders, run: (v, a, s = "mcp") => setProjectReminders(ctxFor(v, s), a) }),
];
