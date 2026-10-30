import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { quietLog, tickPlan } from "./dev-tick";
import { runWorker } from "./worker.mjs";

// 074 amendment 1: `pnpm --filter @amax/web dev` runs `next dev` and, beside it, the jobs tick (production's worker,
// every 10 s). The tick stops when Next stops; Next's exit code is the script's.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
const flag = args.findIndex((a) => a === "-p" || a === "--port");
if (flag >= 0 && args[flag + 1]) process.env.PORT = args[flag + 1];

const next = spawn(process.execPath, [createRequire(import.meta.url).resolve("next/dist/bin/next"), "dev", ...args], { stdio: "inherit" });
const stop = new AbortController();
next.on("exit", (code) => {
  stop.abort();
  process.exitCode = code ?? 0;
});
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => { stop.abort(); next.kill(sig); });

const plan = tickPlan(process.env);
if ("off" in plan) console.log(`jobs tick: off (${plan.off})`);
else {
  console.log(`jobs tick: every ${plan.intervalMs / 1000} s`);
  void runWorker({ ...plan, signal: stop.signal, log: quietLog() });
}
