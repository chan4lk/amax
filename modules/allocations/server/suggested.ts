import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@amax/db";
import { defineService } from "@amax/core/server";
import { EVENTS, type FixSuggested } from "../contracts";

export const told = async (tx: Tx, suggestionId: string) =>
  (await tx.execute(sql`select 1 from core.event where name = ${EVENTS.fixSuggested} and payload->>'suggestionId' = ${suggestionId} limit 1`)).length > 0;

export const fixSuggested = defineService({
  name: "allocations.fix.suggested",
  action: "allocations:read",
  resource: "agents.suggestion",
  input: z.object({ suggestionId: z.string(), personUserId: z.string().nullable(), projectId: z.string(), project: z.string(), month: z.string(), total: z.number(), percent: z.number() }),
  run: async (_tx, input: FixSuggested) => ({ result: input, resourceId: input.suggestionId, after: input, events: [{ name: EVENTS.fixSuggested, payload: input }] }),
});
