import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "@amax/db";
import { hasDb } from "@amax/db/testdb";
import { contextForViewer, setGrants, type Viewer } from "@amax/auth";
import { agentsPlatform } from "@amax/agents/module";
import { acceptSuggestion, setSuggestionKinds } from "@amax/agents/server";
import delivery from "../module";
import { proposalAgent } from "../server/agent";
import { ctxFor } from "../server/context";
import { addProposalTask, updateProposal, withdrawProposal } from "../server/lifecycle";
import { proposalKinds } from "../server/proposal-kinds";
import { createProposal, createRelease, moveProposal, recordDeployment } from "../server/services";
import { markTaskDone } from "../server/tasks";
import { linkIdentity } from "../suggestions";
import { proposalDb, T } from "./proposal-db";
import { tracked } from "./release-fields";

// 118 (117 final pass): accepting a Suggested owner follows the Unassigned chip's rule: an open proposal takes the
// owner; one released since the suggestion was made is refused with nothing changed.
describe.skipIf(!hasDb)("118 the Suggested owner's accept guard (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer;
  beforeAll(async () => {
    db = await proposalDb();
    setGrants([delivery, agentsPlatform as never]);
    setSuggestionKinds([linkIdentity, ...proposalKinds]);
    maya = await db.as("maya");
  }, 120_000);
  afterAll(() => db?.t.drop());
  let seen = 0;
  const runAgent = async () => {
    const events = await db.q(sql`select id, name, payload from core.event where name like 'delivery.%' order by created_at, id`);
    for (const e of events.slice(seen)) {
      for (const h of proposalAgent.filter((x) => x.event === e.name)) await withTenant(db.app, T, (tx) => h.handle({ tx, tenantId: T, event: { id: e.id as string, name: e.name as string, payload: e.payload as Record<string, unknown> } }));
    }
    seen = events.length;
  };

  // Review round 2: each state reached through the service that makes it, never a direct update.
  const releaseIt = async (key: string) => {
    const version = `v7.${Date.now()}`;
    await moveProposal(ctxFor(maya), { key, to: "verified" });
    await createRelease(ctxFor(maya), { ...tracked(), projectKey: "CON", version, proposalKeys: [key] });
    await recordDeployment(ctxFor(maya), { projectKey: "CON", version, environment: "Prod" });
  };
  it.each([
    ["still open", null, null],
    ["released since", releaseIt, /is released now and needs no owner/],
    ["withdrawn since", (key: string) => withdrawProposal(ctxFor(maya), { key, reason: "Client dropped it" }), /was withdrawn/],
    ["given a named owner since", async (key: string) => { await updateProposal(ctxFor(maya), { key, ownerUserId: (await db.as("nimal")).userId }); }, /has an owner now \(Nimal Silva\)/],
  ] as const)("a Suggested owner for a proposal %s", async (_n, since, refused) => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: `Accept guard ${_n}` });
    await addProposalTask(ctxFor(maya), { key, title: "Step 1" });
    for (const to of ["planned", "building"] as const) await moveProposal(ctxFor(maya), { key, to });
    await db.t.owner`update delivery.proposal set owner_user_id = null, owner_name = null where key = ${key}`;
    await markTaskDone(ctxFor(maya), { key, task: "T1" });
    await runAgent();
    const [s] = await db.q(sql`select s.id from agents.suggestion s join delivery.proposal p on p.id::text = s.target_id where p.key = ${key} and s.kind = 'delivery.proposal-owner'`);
    await since?.(key);
    const before = (await db.row(key)).owner_user_id;
    const result = await acceptSuggestion(contextForViewer(maya, "chat"), { id: s.id as string }).then(() => "accepted", (e: Error) => e.message);
    if (!refused) { expect([result, (await db.row(key)).owner_user_id]).toEqual(["accepted", maya.userId]); return; }
    expect([refused.test(result), (await db.row(key)).owner_user_id]).toEqual([true, before]);
  });
});
