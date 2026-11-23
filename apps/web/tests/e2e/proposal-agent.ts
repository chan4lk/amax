import { sql } from "drizzle-orm";
import { createDb, withTenant } from "@amax/db";
import { configureRuntime, contextFor } from "@amax/core/server";
import { installAuthorizer, setGrants } from "@amax/auth";
import { setSuggestionKinds } from "@amax/agents/server";
import { lumen } from "@amax/testing";
import { proposalAgent } from "../../../../modules/delivery/server/agent";
import { proposalKinds } from "../../../../modules/delivery/server/proposal-kinds";
import { addProposalTask } from "../../../../modules/delivery/server/lifecycle";
import { createProposal, moveProposal } from "../../../../modules/delivery/server/services";
import { markTaskDone } from "../../../../modules/delivery/server/tasks";

const T = lumen.tenant.id;

/**
 * 081 AC-37: a hand-made proposal reaches Building with one open task, and that task is closed as specclaw CI does it,
 * through Delivery's services as a credential acting for Maya. Then the Delivery agent reads that task.done event the
 * way the job runner does (the e2e app runs no cron tick: CRON_SECRET is unset, as for every e2e). Everything after
 * this is done in the browser, as a person.
 */
export async function lastTaskClosedByCi(title: string) {
  const url = Object.assign(new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax"), { pathname: `/${process.env.E2E_DB ?? "amax_e2e"}` }).toString();
  // Four connections: the agent handler holds one in its transaction while createSuggestion opens its own.
  const { db, client } = createDb(url, { max: 4, connection: { options: "-c role=amax_app" } as never });
  try {
    configureRuntime({ db, auditKey: "e2e-audit-key-e2e-audit-key-e2e-audit" });
    // A job context is no person: no grants to resolve. (The module manifest imports its screens and their CSS,
    // which Playwright's loader can't read, so the helper takes only the server code it needs.)
    setGrants([{ grants: {} }]);
    installAuthorizer();
    setSuggestionKinds(proposalKinds);
    const [maya] = await withTenant(db, T, (tx) => tx.execute(sql`select id from auth.user where email = 'maya@lumenlabs.test'`));
    const ci = contextFor.job(T, "e2e-specclaw-ci", `user:${maya.id as string}`);
    const { key } = await createProposal(ci, { projectKey: "CON", title });
    await addProposalTask(ci, { key, title: "Write it" });
    for (const to of ["planned", "building"] as const) await moveProposal(ci, { key, to });
    await markTaskDone(ci, { key, task: "T1", commit: "e2e0c0ffee" });
    const [event] = await withTenant(db, T, (tx) => tx.execute(sql`select id, name, payload from core.event where name = 'delivery.task.done' and payload->>'key' = ${key} order by created_at desc limit 1`));
    for (const h of proposalAgent.filter((x) => x.event === event.name)) {
      await withTenant(db, T, (tx) => h.handle({ tx, tenantId: T, event: { id: event.id as string, name: event.name as string, payload: event.payload as Record<string, unknown> } }));
    }
    // Closing the task wrote its line to the Overview's activity feed, as real CI does; this run's line goes again, so
    // the Overview's own e2e reads the fixtures' feed.
    await withTenant(db, T, (tx) => tx.execute(sql`delete from delivery.activity where text like ${`%${key} ${title}%`}`));
    return key;
  } finally {
    await client.end();
  }
}

/**
 * 081 amendment 5: a browser test that closes and reopens a task through chat writes Overview feed lines, as real use
 * does. This removes that run's lines (by their text), so the Overview's own e2e reads the fixtures' feed.
 */
export async function forgetActivity(text: string) {
  const url = Object.assign(new URL(process.env.DATABASE_MIGRATE_URL ?? "postgres://amax:amax@127.0.0.1:5440/amax"), { pathname: `/${process.env.E2E_DB ?? "amax_e2e"}` }).toString();
  const { db, client } = createDb(url, { max: 1, connection: { options: "-c role=amax_app" } as never });
  try {
    await withTenant(db, T, (tx) => tx.execute(sql`delete from delivery.activity where text like ${`%${text}%`}`));
  } finally {
    await client.end();
  }
}
