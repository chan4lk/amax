import { sql } from "drizzle-orm";

// 081 amendment 4: who closed a task, from `delivery.task.done_by` (alias `t`). Git can't say whether a person or an
// agent wrote a commit, so a commit's close counts as the person it is verified for, never as an agent.
//   agent:<name>[ for user:<id>]                  an agent, through amax's tools  -> agents
//   user:<id>                                     a person, in amax               -> people
//   job:delivery.ingest for user:<id>             a person's verified git commit  -> people
//   anything else (a CI credential, another job)  automation                      -> automation
export const BY_AGENT = sql`t.done_by like 'agent:%'`;
export const BY_PERSON = sql`(t.done_by like 'user:%' or t.done_by like 'job:delivery.ingest for user:%')`;
