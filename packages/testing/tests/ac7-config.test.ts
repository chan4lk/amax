import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnv } from "@amax/core/env";

const repo = join(__dirname, "../../..");
const standard = (root: string) => spawnSync("node", [join(repo, "scripts/check-module-standard.mjs"), "--root", root], { encoding: "utf8" });

describe("AC7 configuration and ownership", () => {
  it("AC7 bad environment fails with a clear message and the module standard is enforced", () => {
    expect(loadEnv({ AMAX_BASE_URL: "https://amax.example.dev" }).NODE_ENV).toBe("development");
    expect(() => loadEnv({ AMAX_BASE_URL: "not-a-url", PORT: "abc" })).toThrow(/AMAX_BASE_URL[\s\S]*PORT[\s\S]*Fix these variables/);
    expect(standard(repo).status).toBe(0);
    const broken = standard(join(__dirname, "../standard/missing"));
    expect(broken.status).toBe(2);
    expect(broken.stderr).toMatch(/missing README\.md[\s\S]*no CODEOWNERS line/);
  });

  it("032 AC-1 a module whose personal-data table has no retention entry fails the standard; pseudonymous ids alone don't count", () => {
    const r = standard(join(__dirname, "../standard/no-retention"));
    expect(r.status).toBe(2);
    expect(r.stderr.trim().split("\n").filter((l) => l.includes("retention"))).toEqual(["  - modules/people: personal-data table people.visit has no retention entry (032)"]);
  });

  // Review 058 B3: every way Postgres spells a table or column is read, a statement the scan can't
  // read fails the check, a comment is not a retention entry, and every entry names its subject.
  const cases: { name: string; sql: string; manifest: string; problem: RegExp | null }[] = [
    { name: "upper-case CREATE TABLE", sql: "CREATE TABLE people.visit (\n  id uuid PRIMARY KEY,\n  visitor_email text\n);", manifest: "", problem: /people\.visit has no retention entry/ },
    { name: "create table if not exists", sql: "create table if not exists people.visit (id uuid, visitor_email text);", manifest: "", problem: /people\.visit has no retention entry/ },
    { name: "one-line table", sql: "create table people.visit (id uuid primary key, visitor_email text not null);", manifest: "", problem: /people\.visit has no retention entry/ },
    { name: "alter table add without column", sql: "create table people.visit (id uuid);\nalter table people.visit add visitor_email text;", manifest: "", problem: /people\.visit has no retention entry/ },
    { name: "alter table add if not exists, quoted", sql: "create table people.visit (id uuid);\nALTER TABLE people.visit ADD COLUMN IF NOT EXISTS \"phone_home\" text;", manifest: "", problem: /people\.visit has no retention entry/ },
    { name: "a comment is not an entry", sql: "create table people.visit (id uuid, visitor_email text);", manifest: '// table: "people.visit"\nexport default { id: "people" };', problem: /people\.visit has no retention entry/ },
    { name: "an entry with no subject", sql: "create table people.visit (id uuid, visitor_email text);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", fields: ["visitor_email"] }] };', problem: /people\.visit names no subject or subjectName/ },
    { name: "an unreadable create table", sql: "create table people.visit as select * from people.badge;", manifest: "", problem: /can't read "create table people\.visit as select/ },
    { name: "a findable entry passes", sql: "CREATE TABLE IF NOT EXISTS people.visit (id uuid, visitor_email text);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["id"], fields: ["visitor_email"] }] };', problem: null },
    // 070 review round 1: every personal or jsonb column is named by the table's entry, whichever migration added it.
    { name: "an alter-added *_by column the entry never names", sql: "create table people.visit (id uuid, visitor_email text);\nalter table people.visit add column deleted_by text;", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["id"], fields: ["visitor_email"] }] };', problem: /people\.visit\.deleted_by holds personal data/ },
    { name: "a jsonb column that can copy a note", sql: "create table people.visit (id uuid, visitor_email text, before jsonb not null);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["id"], fields: ["visitor_email"] }] };', problem: /people\.visit\.before holds personal data/ },
    { name: "a personal column named only as a subject", sql: "create table people.visit (id uuid, visitor_email text, host_by text);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["id", "host_by"], fields: ["visitor_email"] }] };', problem: null },
    { name: "a jsonb column kept with a reason", sql: "create table people.visit (id uuid, visitor_email text, totals jsonb);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["id"], fields: ["visitor_email"], keep: { totals: "visit counts, no person in them" } }] };', problem: null },
    { name: "a keep naming another column leaves this one flagged", sql: "create table people.visit (id uuid, visitor_email text, totals jsonb, host_note text);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["id"], fields: ["visitor_email"], keep: { totals: "counts" } }] };', problem: /people\.visit\.host_note holds personal data/ },
    // 070 review round 3: free text and json in any table about people, including one with only a pseudonymous id.
    { name: "a free-text detail column the entry never names", sql: "create table people.visit (id uuid, visitor_email text, detail text);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["id"], fields: ["visitor_email"] }] };', problem: /people\.visit\.detail holds personal data/ },
    { name: "a *_reason column added later", sql: "create table people.visit (id uuid, visitor_email text);\nalter table people.visit add column void_reason text;", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["id"], fields: ["visitor_email"] }] };', problem: /people\.visit\.void_reason holds personal data/ },
    { name: "jsonb in a table whose only person column is user_id, with no entry", sql: "create table people.visit (id uuid, user_id uuid, extra jsonb);", manifest: "", problem: /people\.visit\.extra holds personal data/ },
    { name: "free text in a user_id table, named in fields", sql: "create table people.visit (id uuid, user_id uuid, summary text);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["user_id"], fields: ["summary"] }] };', problem: null },
    { name: "every column named across two entries", sql: "create table people.visit (id uuid, visitor_email text, extra json);", manifest: 'export default { id: "people", retention: [{ table: "people.visit", subject: ["id"], fields: ["visitor_email"] }, { table: "people.visit", subject: ["id"], fields: ["extra"] }] };', problem: null },
  ];
  it.each(cases)("058 the retention check: $name", ({ sql, manifest, problem }) => {
    const root = mkdtempSync(join(tmpdir(), "amax-standard-"));
    try {
      cpSync(join(__dirname, "../standard/no-retention"), root, { recursive: true });
      writeFileSync(join(root, "modules/people/db/migrations/0001_people.sql"), sql);
      writeFileSync(join(root, "modules/people/module.ts"), manifest || 'export default { id: "people" };');
      const r = standard(root);
      if (problem) {
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(problem);
      } else expect(r.status, r.stderr).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // Review 058 round 2: the check runs when started through a path with a space or a symlink; it must
  // never exit 0 without checking.
  it.each([["a space", "with space"], ["a symlink", "link"], ["both", "a link with space"]])("runs the check through %s", (_, name) => {
    const dir = mkdtempSync(join(tmpdir(), "amax-cli-"));
    try {
      const at = join(dir, name);
      symlinkSync(repo, at);
      const r = spawnSync("node", [join(at, "scripts/check-module-standard.mjs"), "--root", join(__dirname, "../standard/missing")], { encoding: "utf8" });
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/missing README\.md/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("043 AC-1 a write tool that declares no service fails the standard; one that declares a service or null passes", () => {
    const root = mkdtempSync(join(tmpdir(), "amax-standard-"));
    try {
      cpSync(join(__dirname, "../standard/no-retention"), root, { recursive: true });
      const mcp = (tools: string) => writeFileSync(join(root, "modules/people/mcp.ts"), `export const mcpTools = [${tools}];`);
      mcp(`tool({ ...write("people:visit"), name: "log_visit", run: (v, a) => logVisit(ctxFor(v), a) }), tool({ ...read, name: "list_visits", run: list })`);
      expect(standard(root).stderr).toMatch(/modules\/people: write tool log_visit declares no service \(043\)/);
      mcp(`tool({ ...write("people:visit"), name: "log_visit", service: logVisit, run: (v, a) => logVisit(ctxFor(v), a) }), tool({ scope: "write", name: "promote", service: null, run: promote })`);
      expect(standard(root).stderr).not.toMatch(/declares no service/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
