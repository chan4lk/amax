import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import { isoWeek, read, tool } from "./mcp-kit";
import { ctxFor } from "./server/context";
import { decideCard, proposeDecide } from "./server/decide-card";
import { decideRequest } from "./server/decide-request";
import { answerRequest, cancelRequest, requestChange } from "./server/request";
import { answerCard, cancelCard, proposeAnswer, proposeCancel, proposeRequest, requestCard } from "./server/request-card";
import { listRequests } from "./server/requests-read";

// 070 amendment 3: change requests for submitted and approved weeks, asked for by the owner and decided by an approver.
const status = z.enum(["pending", "needs_info", "applied", "reopened", "completed", "declined", "cancelled"]);
const requestId = z.uuid().describe("The change request's id, from get_change_requests");

export const requestTools: McpToolDef[] = [
  tool({ ...read, pin: "view", name: "get_change_requests", description: "Timesheet change requests: your own, and those you review as an approver. Filter by id, status or ISO week; mine: true for only yours, false for only those you review.",
    input: z.object({ id: z.uuid().optional(), status: status.optional(), week: isoWeek.optional(), mine: z.boolean().optional() }),
    run: (v, a) => listRequests(v, a) }),
  tool({ name: "request_time_change", description: "Ask an approver to change or remove one entry of your own SUBMITTED or APPROVED week, which you can't edit yourself (for a draft or rejected week use correct_time_entry). Take the entryId from get_my_week; give the new hours, billable flag, note or project, or remove: true, and a reason. Nothing changes until an approver decides.",
    scope: "write", permission: "time:log",
    input: z.object({ entryId: z.uuid(), hours: z.number().positive().max(24).optional(), billable: z.boolean().optional(), note: z.string().max(500).optional(), projectKey: z.string().optional(),
      remove: z.boolean().optional().describe("true to ask for the entry to be removed"), reason: z.string().describe("Why the entry is wrong, 3 to 500 characters") }),
    propose: proposeRequest, card: requestCard, service: requestChange, run: (v, a, s = "mcp") => requestChange(ctxFor(v, s), a) }),
  tool({ name: "decide_change_request", description: "Decide on a change request you review. apply: make the requested change now; the week keeps its status and the person is told. reopen: put the week back to draft (submitted or approved) for the person to fix and resubmit. ask: put a question to the person (note). decline: refuse it (note says why).",
    scope: "write", permission: "time:approve",
    input: z.object({ requestId, decision: z.enum(["apply", "reopen", "ask", "decline"]), note: z.string().optional().describe("Required for ask and decline") }),
    propose: proposeDecide, card: decideCard, service: decideRequest, run: (v, a, s = "mcp") => decideRequest(ctxFor(v, s), a) }),
  tool({ name: "answer_change_request", description: "Answer an approver's question about your change request; it goes back to them for a decision.", scope: "write", permission: "time:log",
    input: z.object({ requestId, answer: z.string() }), propose: proposeAnswer, card: answerCard, service: answerRequest, run: (v, a, s = "mcp") => answerRequest(ctxFor(v, s), a) }),
  tool({ name: "cancel_change_request", description: "Withdraw your own change request while it waits for a decision.", scope: "write", permission: "time:log",
    input: z.object({ requestId }), propose: proposeCancel, card: cancelCard, service: cancelRequest, run: (v, a, s = "mcp") => cancelRequest(ctxFor(v, s), a) }),
];
