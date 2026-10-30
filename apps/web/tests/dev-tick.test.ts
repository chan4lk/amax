import { describe, expect, it } from "vitest";
import { quietLog, tickPlan } from "../scripts/dev-tick";

// 074 amendment 1: `dev` runs the jobs tick on its own against a local database, and only says something when it matters.
const env = { DATABASE_URL: "postgres://amax_app:amax_app@127.0.0.1:5440/amax", CRON_SECRET: "s3cret" };

describe("074 dev jobs tick", () => {
  it.each([
    ["a local database", {}, { url: "http://localhost:3000/api/jobs/tick", secret: "s3cret", intervalMs: 10_000 }],
    ["another port and interval", { PORT: "3100", AMAX_TICK_SECONDS: "30" }, { url: "http://localhost:3100/api/jobs/tick", secret: "s3cret", intervalMs: 30_000 }],
    ["a remote database", { DATABASE_URL: "postgres://u:p@db.example.com/amax" }, { off: "db.example.com is not a local database" }],
    ["no CRON_SECRET", { CRON_SECRET: undefined }, { off: "no CRON_SECRET" }],
    ["AMAX_DEV_TICK=0", { AMAX_DEV_TICK: "0" }, { off: "AMAX_DEV_TICK=0" }],
  ])("AC10 %s", (_n, over, want) => expect(tickPlan({ ...env, ...over })).toEqual(want));

  it("AC10 the log stays quiet: delivered work and failures after Next is ready, nothing else", () => {
    const out: string[] = [];
    const log = quietLog((l) => out.push(l));
    log("tick failed: fetch failed");
    log('tick 200 {"ok":true,"jobs":0,"jobsFailed":0,"events":0,"eventsFailed":0,"scheduled":0}');
    log('tick 200 {"ok":true,"jobs":1,"jobsFailed":0,"events":3,"eventsFailed":1,"scheduled":0}');
    log('tick 500 {"error":"tick failed"}');
    expect(out).toEqual(["jobs tick: 3 events, 1 event failed, 1 job", 'jobs tick: tick 500 {"error":"tick failed"}']);
  });
});
