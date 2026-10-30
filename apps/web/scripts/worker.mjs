// k3s worker: `node apps/web/worker.mjs`. Calls the web app's tick route every interval, so jobs
// run inside the app with its module registry. Env: AMAX_TICK_URL, CRON_SECRET, AMAX_TICK_SECONDS.
import { pathToFileURL } from "node:url";

export async function runWorker({ url, secret, intervalMs = 60_000, signal, log = console.log, fetchImpl = fetch }) {
  while (!signal?.aborted) {
    try {
      const res = await fetchImpl(url, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal });
      log(`tick ${res.status} ${await res.text()}`);
    } catch (e) {
      if (signal?.aborted) break;
      log(`tick failed: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((resolve) => {
      const t = setTimeout(resolve, intervalMs);
      signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { AMAX_TICK_URL: url, CRON_SECRET: secret, AMAX_TICK_SECONDS = "60" } = process.env;
  if (!url || !secret) {
    console.error("amax worker: set AMAX_TICK_URL and CRON_SECRET");
    process.exit(1);
  }
  const stop = new AbortController();
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => stop.abort());
  await runWorker({ url, secret, intervalMs: Number(AMAX_TICK_SECONDS) * 1000, signal: stop.signal });
}
