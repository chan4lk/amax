import { existsSync } from "node:fs";
import { configureRuntime } from "@amax/core/server";
import { createDb } from "@amax/db";
import { seedWalkthroughExtras, walkthroughLoaded } from "./demo-extras";
import { isMain, seedInstalledModules } from "./seed-demo";

// 074: `pnpm --filter @amax/web dev` loads the Lumen Labs demo data first, so a fresh local database is ready to use.
// Only a local database is seeded, never one elsewhere; AMAX_SEED_DEMO=0 turns it off. It never stops Next starting.
const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Why `url` isn't a local database, or null when it is. The dev tick uses the same check. */
export function notLocal(url: string | undefined): string | null {
  if (!url) return "no DATABASE_URL";
  let host: string;
  try { host = new URL(url).hostname; } catch { return "DATABASE_URL isn't a valid URL"; }
  return LOCAL.has(host) ? null : `${host} is not a local database`;
}

/** Whether to seed, or why not. */
export function seedDecision(url: string | undefined, env: Record<string, string | undefined>): { seed: true } | { skip: string } {
  if (env.AMAX_SEED_DEMO === "0") return { skip: "AMAX_SEED_DEMO=0" };
  const why = notLocal(url);
  if (why) return { skip: why };
  return env.AUDIT_HASH_KEY ? { seed: true } : { skip: "no AUDIT_HASH_KEY" };
}

/**
 * Once per database: every module's fixtures, then the 070–073 walkthrough. Later starts change nothing, so edits made
 * in the demo stay (`seed:demo` reloads module data on demand). Fixtures check the audit chain, so it needs the app's key.
 */
export async function seedDevDemo(url: string, auditKey: string): Promise<string> {
  const { db, client } = createDb(url, { max: 1 });
  try {
    if (await walkthroughLoaded(db)) return "demo data: already loaded";
    configureRuntime({ db, auditKey });
    const r = await seedInstalledModules(db);
    await seedWalkthroughExtras(db);
    return `demo data: seeded ${r.modules.join(", ")} + the 070–073 walkthrough`;
  } finally {
    await client.end();
  }
}

if (isMain(import.meta.url, process.argv[1])) {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
  const go = seedDecision(process.env.DATABASE_URL, process.env);
  if ("skip" in go) console.log(`demo data: skipped (${go.skip})`);
  else await seedDevDemo(process.env.DATABASE_URL!, process.env.AUDIT_HASH_KEY!).then(console.log, (e: Error) => console.error(`demo data: not loaded (${e.message})`));
}
