import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import type { Viewer } from "@amax/auth";
import { githubCallback } from "../server/callback";
import { ctxFor } from "../server/context";
import { returnResult } from "../server/read";
import { ResultNote, UNMATCHED } from "../ui/ResultNote";
import { gitAccountsDatabase } from "./setup";

const html = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup(node as never).replace(/&#x27;/g, "'");

// 112 AC-2: every return from GitHub is recorded on the state it carries; the screen's note reads exactly that record,
// owned by the viewer, never the URL and never an earlier attempt.
describe.skipIf(!hasDb)("112 the Git accounts note is about this return, from its record (Postgres)", () => {
  let db: Awaited<ReturnType<typeof gitAccountsDatabase>>;
  let kasun: Viewer, nimal: Viewer;
  beforeAll(async () => { db = await gitAccountsDatabase(); [kasun, nimal] = [await db.as("kasun"), await db.as("nimal")]; await db.setUpApp(); }, 120_000);
  afterAll(() => db?.drop());
  const newState = async (v: Viewer) => new URL(((await db.registry.call(v, "connect_github", {}, { source: "mcp" })) as { open: { url: string } }).open.url).searchParams.get("state")!;
  const note = async (v: Viewer, ref: string | undefined, connectedAs?: { logins: string[]; emails: number }) =>
    html(ResultNote({ shown: true, record: ref ? await returnResult(v, ref) : null, connectedAs }));
  let used = "";

  it.each([
    ["a connect that worked", async () => { used = await newState(kasun); return { state: used, code: "good" }; }, { logins: ["kasun-dias"], emails: 2 }, "GitHub connected as @kasun-dias: 2 emails"],
    ["a connect GitHub refused, after that success", async () => ({ state: await newState(kasun), code: "noverified" }), undefined, "GitHub has no verified email for you"],
    ["declined on GitHub, after those", async () => ({ state: await newState(kasun), error: "access_denied" }), undefined, "you didn't approve it on GitHub"],
    ["an incomplete return", async () => ({ state: await newState(kasun) }), undefined, "GitHub didn't finish the sign-in"],
    ["the first link returned again: its first outcome stands", async () => ({ state: used, code: "good" }), { logins: ["kasun-dias"], emails: 2 }, "GitHub connected as @kasun-dias"],
    ["a link used up by a refusal, returned again: the refusal stands", async () => {
      const state = await newState(kasun);
      await githubCallback(ctxFor(kasun), { state, code: "noverified" });
      return { state, code: "good" };
    }, undefined, "GitHub has no verified email for you"],
  ])("AC2 %s: the note is this return's", async (_name, make, connectedAs, text) => {
    const params = await make();
    const query = await githubCallback(ctxFor(kasun), params as Record<string, string>);
    expect(await note(kasun, query.ref, connectedAs)).toContain(text);
  });

  it("final pass 2: two real returns on one state share one record, and the first outcome stands", async () => {
    const state = await newState(kasun);
    const [first, second] = [await githubCallback(ctxFor(kasun), { state, code: "good" }), await githubCallback(ctxFor(kasun), { state, code: "good" })];
    expect([first.ref === second.ref, (await returnResult(kasun, first.ref))?.result]).toEqual([true, "connected"]);
  });

  it("final pass 3: a duplicate return while the first waits on GitHub only reads; the first return's refusal stands", async () => {
    const state = await newState(kasun);
    const first = githubCallback(ctxFor(kasun), { state, code: "slownoverified" });
    await new Promise((ok) => setTimeout(ok, 300));
    const second = await githubCallback(ctxFor(kasun), { state, code: "good" });
    const done = await first;
    expect([done.ref === second.ref, (await returnResult(kasun, done.ref))?.result]).toEqual([true, "no-email"]);
  });

  it("final pass 3: a reference that isn't a UUID reads nothing", async () => {
    expect(await returnResult(kasun, "-".repeat(36))).toBeNull();
  });

  it("final pass 2: someone connected sees no note for a return amax has no record of", async () => {
    expect(await note(kasun, undefined, { logins: ["kasun-dias"], emails: 2 })).toBe("");
  });

  it("AC2 someone else's record, or no record, says only the fixed sentence", async () => {
    const query = await githubCallback(ctxFor(kasun), { state: await newState(kasun), error: "access_denied" });
    expect([await note(nimal, query.ref), await note(kasun, undefined)]).toEqual([expect.stringContaining(UNMATCHED), expect.stringContaining(UNMATCHED)]);
  });
});
