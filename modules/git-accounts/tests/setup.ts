import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { sql } from "drizzle-orm";
import { withTenant, type Tx } from "@amax/db";
import { migratedDatabase } from "@amax/db/testdb";
import { configureSecrets, localKms, putSecret } from "@amax/core/secrets";
import { configureRuntime, contextFor } from "@amax/core/server";
import { installAuthorizer, setGrants, viewerForUser, type Viewer } from "@amax/auth";
import { authFixtures } from "@amax/auth/fixtures";
import { createRegistry } from "@amax/mcp";
import { loadFixtures, lumen } from "@amax/testing";
import gitAccounts from "../module";
import { forgetAppCheck } from "../server/app";

export const T = lumen.tenant.id;

/** A fake GitHub (fictional data): one app; code "good" is @kasun-dias with two verified emails and one unverified;
 * "nologin" and "noemails" give replies that don't match GitHub's schema; with "hang" GitHub never answers for the profile,
 * with "reset" it drops the connection; "noverified" has no verified email; "many" has a further page of emails. */
function fakeGitHub(): Promise<Server> {
  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (req.url === "/login/oauth/access_token") {
        const b = JSON.parse(body || "{}");
        if (b.code === "mismatch") return send(200, { error: "redirect_uri_mismatch" });
        // 117 review round 1: a wrong client id or secret is GitHub's incorrect_client_credentials; an unknown code is bad_verification_code.
        if (b.client_id !== "app-id" || b.client_secret !== "app-secret-fake-0000000000") return send(200, { error: "incorrect_client_credentials" });
        const ok = ["good", "nologin", "noemails", "hang", "reset", "noverified", "many", "slownoverified"].includes(b.code);
        return ok ? send(200, { access_token: `gho_${b.code}` }) : send(200, { error: "bad_verification_code" });
      }
      const token = String(req.headers.authorization ?? "").replace("Bearer ", "");
      if (!token.startsWith("gho_")) return send(401, {});
      if (req.url === "/user" && token === "gho_hang") return;
      if (req.url === "/user" && token === "gho_slownoverified") return void setTimeout(() => send(200, { login: "kasun-dias", id: 4821937 }), 800);
      if (req.url?.startsWith("/user/emails") && token === "gho_slownoverified") return send(200, [{ email: "kasun@unverified.test", verified: false }]);
      if (req.url === "/user" && token === "gho_reset") return req.socket.destroy();
      if (req.url === "/user") return send(200, token === "gho_nologin" ? { id: 4821937 } : { login: "kasun-dias", id: 4821937 });
      if (req.url?.startsWith("/user/emails") && token === "gho_noverified") return send(200, [{ email: "kasun@unverified.test", verified: false }]);
      if (req.url?.startsWith("/user/emails") && token === "gho_many") {
        res.writeHead(200, { "content-type": "application/json", link: '<https://api.github.test/user/emails?page=2>; rel="next"' });
        return res.end(JSON.stringify([{ email: "kasun@lumenlabs.test", verified: true }]));
      }
      if (req.url?.startsWith("/user/emails")) return send(200, token === "gho_noemails" ? { message: "not a list" }
        : [{ email: "kasun@lumenlabs.test", verified: true }, { email: "4821937+kasun-dias@users.noreply.github.com", verified: true }, { email: "kasun@unverified.test", verified: false }]);
      return send(404, {});
    });
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/** A migrated database with Lumen Labs' demo users, a local key service, the module's tools and a fake GitHub. */
export async function gitAccountsDatabase() {
  const t = await migratedDatabase();
  const app = t.app();
  configureRuntime({ db: app, auditKey: "k".repeat(32) });
  const kms = localKms(new Uint8Array(randomBytes(32)));
  configureSecrets({ kms });
  setGrants([gitAccounts]);
  installAuthorizer();
  await loadFixtures(app, [{ id: "auth", fixtures: [authFixtures] }, gitAccounts], lumen);
  const github = await fakeGitHub();
  const origin = `http://127.0.0.1:${(github.address() as AddressInfo).port}`;
  Object.assign(process.env, { AMAX_GITHUB_URL: origin, AMAX_GITHUB_API_URL: origin, AMAX_BASE_URL: "http://localhost:3000" });
  const registry = createRegistry([gitAccounts]);
  const as = async (key: string): Promise<Viewer> => {
    const [u] = await withTenant(app, T, (tx) => tx.execute(sql`select id from auth.user where email = ${`${key}@lumenlabs.test`}`));
    return (await withTenant(app, T, (tx) => viewerForUser(tx, T, u.id as string)))!;
  };
  // 119: the app's check is dropped when the app is written, as set_github_app does.
  const setUpApp = () => putSecret(contextFor.job(T, "seed"), { connector: "github-oauth", value: "app-id:app-secret-fake-0000000000" }).finally(() => forgetAppCheck(T));
  const tx = <R>(fn: (tx: Tx) => Promise<R>) => withTenant(app, T, fn);
  const drop = async () => { github.close(); await t.drop(); };
  return { t, app, registry, as, tx, setUpApp, origin, drop, kms };
}
