#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const at = args.indexOf("--root");
const root = resolve(at > -1 ? args[at + 1] : join(new URL(".", import.meta.url).pathname, ".."));
const modulesDir = join(root, "modules");
const owners = existsSync(join(root, ".github/CODEOWNERS")) ? readFileSync(join(root, ".github/CODEOWNERS"), "utf8") : "";
const REQUIRED = ["module.ts", "README.md", "contracts.ts", "fixtures", "tests", "package.json"];

const PERSONAL = /^(initials|[a-z_]*_name|[a-z_]*email[a-z_]*|phone[a-z_]*|[a-z_]+_by|by_actor|[a-z_]*user_id|[a-z_]*person_id|note|[a-z_]+_note|comment|[a-z_]+_comment|base_salary|epf_number|bank_[a-z_]+|acts_for)$/;
const PSEUDONYMOUS = /(^|_)(user|person)_id$/;
// Free text a person writes, which can say anything about anyone (070 review round 3).
const FREE_TEXT = /^([a-z_]+_)?(detail|details|description|summary|body|reason|notes?|comments?|answer|question|message|remarks|feedback|bio|text)$/;

// Review 058 B3: the scan reads SQL the way Postgres does (any case, `if not exists`, one-line
// tables, `alter table … add` without `column`) and reports a statement it can't read instead of
// passing it silently.
const stripSql = (src) => src.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "''").replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const ident = String.raw`"?([a-z_][a-z0-9_]*)"?`;
const qualified = String.raw`${ident}\s*\.\s*${ident}`;
const CONSTRAINT = /^(constraint|primary|unique|check|foreign|exclude|like)\b/i;

function topLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  return [...parts, cur].map((x) => x.trim()).filter(Boolean);
}

export function scanSql(src) {
  const columns = [];
  const unreadable = [];
  for (const raw of stripSql(src).split(";")) {
    const stmt = raw.trim();
    if (!stmt) continue;
    // A temporary table lives for one session and holds nothing to retain.
    if (/^create\s+(?:(?:global|local)\s+)?temp(?:orary)?\s+table\b/i.test(stmt)) continue;
    if (/^create\s+(?:unlogged\s+)?table\b/i.test(stmt)) {
      const m = stmt.match(new RegExp(String.raw`^create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${qualified}\s*\(([\s\S]*)\)[^()]*$`, "i"));
      if (!m) {
        unreadable.push(stmt.split("\n")[0].slice(0, 80));
        continue;
      }
      const table = `${m[1]}.${m[2]}`.toLowerCase();
      for (const part of topLevel(m[3])) {
        const col = part.match(/^"?([a-z_][a-z0-9_]*)"?\s+([a-z]+)?/i);
        if (!CONSTRAINT.test(part)) columns.push([table, col?.[1]?.toLowerCase(), col?.[2]?.toLowerCase()]);
      }
      continue;
    }
    const alter = stmt.match(new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${qualified}\s+([\s\S]*)$`, "i"));
    if (alter) {
      const table = `${alter[1]}.${alter[2]}`.toLowerCase();
      for (const action of topLevel(alter[3])) {
        const add = action.match(/^add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?\s*([a-z]+)?/i);
        if (add && !CONSTRAINT.test(add[1])) columns.push([table, add[1].toLowerCase(), add[2]?.toLowerCase()]);
      }
    }
  }
  return { columns: columns.filter(([, c]) => c), unreadable };
}

function scanModule(name) {
  const dir = join(modulesDir, name, "db/migrations");
  if (!existsSync(dir)) return { tables: [], problems: [] };
  const found = new Set();
  const all = [];
  const problems = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    const { columns, unreadable } = scanSql(readFileSync(join(dir, f), "utf8"));
    for (const [table, column] of columns) if (PERSONAL.test(column) && !PSEUDONYMOUS.test(column)) found.add(table);
    all.push(...columns);
    for (const u of unreadable) problems.push(`modules/${name}: can't read "${u}" in ${f}; the retention check needs every create table (032)`);
  }
  // 070 review rounds 1 and 3: a table is about people when it has a personal column or a pseudonymous user/person
  // id. Every personal, free-text or json column of such a table, whichever migration added it, must be named by its
  // retention entries (fields, subject, subjectName, or keep with why), or it is never erased or anonymised.
  const aboutPeople = new Set([...found, ...all.filter(([, c]) => PSEUDONYMOUS.test(c)).map(([t]) => t)]);
  const uncovered = all.filter(([t, c, type]) => aboutPeople.has(t) && ((PERSONAL.test(c) && !PSEUDONYMOUS.test(c)) || FREE_TEXT.test(c) || type === "jsonb" || type === "json"));
  return { tables: [...found], uncovered, problems };
}

// The manifest's retention entries, read from code with comments removed, so a mention in a comment
// is not an entry. Each entry must name the columns requests and holds find the person by.
const stripTs = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// Mirrors PERSON_COLUMN in packages/core/src/module.ts (060 AC-2).
const PERSON_COLUMN = /_by$|_user_id$|_actor$|^person_id$|^(owner|lead|manager|person|by)_name$/;

export function retentionEntries(manifest) {
  const code = stripTs(manifest);
  const hits = [...code.matchAll(/\btable:\s*"([^"]+)"/g)];
  return hits.map((h, i) => {
    const body = code.slice(h.index, hits[i + 1]?.index ?? code.length);
    const list = (key) => [...(body.match(new RegExp(`\\b${key}:\\s*\\[([^\\]]*)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const found = [...list("subject"), ...list("subjectName")];
    const unfound = list("fields").filter((f) => PERSON_COLUMN.test(f) && !found.includes(f));
    return { table: h[1], findable: /\bsubject(Name)?:\s*\[\s*"/.test(body), unfound, covered: [...found, ...list("fields"), ...[...(body.match(/\bkeep:\s*\{([^}]*)\}/)?.[1] ?? "").matchAll(/([a-z_][a-z0-9_]*)\s*:\s*"/g)].map((m) => m[1])] };
  });
}

function unretained(name) {
  const manifest = existsSync(join(modulesDir, name, "module.ts")) ? readFileSync(join(modulesDir, name, "module.ts"), "utf8") : "";
  const entries = retentionEntries(manifest);
  const { tables, uncovered = [], problems } = scanModule(name);
  const named = (t, c) => entries.some((e) => e.table === t && e.covered.includes(c));
  return [
    ...problems,
    ...tables.filter((t) => !entries.some((e) => e.table === t)).map((t) => `modules/${name}: personal-data table ${t} has no retention entry (032)`),
    ...entries.filter((e) => e.unfound.length).map((e) => `modules/${name}: retention entry for ${e.table} changes ${e.unfound.join(", ")} but doesn't list ${e.unfound.length === 1 ? "it" : "them"} in subject or subjectName, so that person's rows are never erased, exported or held (060)`),
    // A personal table with no entry at all is reported once, above; its columns aren't listed again.
    ...uncovered.filter(([t, c]) => !named(t, c) && !(tables.includes(t) && !entries.some((e) => e.table === t))).map(([t, c]) => `modules/${name}: ${t}.${c} holds personal data but no retention entry for ${t} names it in subject, subjectName or fields, so it is never erased or anonymised; name it in fields, or in keep with why (070)`),
    ...[...new Set(entries.filter((e) => !e.findable).map((e) => e.table))].map((t) => `modules/${name}: retention entry for ${t} names no subject or subjectName column, so access and erasure requests can't find its rows (032)`),
  ];
}

// 043 AC-1: every write tool in mcp.ts names the service that makes its write (null: never a chat
// card). The registry refuses one that doesn't at startup; this catches it before the app runs.
export function undeclaredWrites(src) {
  const code = stripTs(src);
  const out = [];
  for (const m of code.matchAll(/\btool\(\{/g)) {
    let depth = 0;
    let end = m.index + m[0].length - 1;
    for (; end < code.length; end++) {
      if ("({[".includes(code[end])) depth++;
      if (")}]".includes(code[end]) && --depth === 0) break;
    }
    const body = code.slice(m.index, end);
    if (/scope:\s*"write"|\.\.\.write\b/.test(body) && !/\bservice:/.test(body)) out.push(body.match(/\bname:\s*"([^"]+)"/)?.[1] ?? "(unnamed)");
  }
  return out;
}

const undeclared = (name) => {
  const f = join(modulesDir, name, "mcp.ts");
  return existsSync(f) ? undeclaredWrites(readFileSync(f, "utf8")).map((t) => `modules/${name}: write tool ${t} declares no service (043)`) : [];
};

// Run as the CLI unless imported for the parsers. Compare real paths, not URL text: a checkout path with
// a space or a symlink must never make the check exit 0 without checking (review 058 round 2).
const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};
const isCli = !!process.argv[1] && real(fileURLToPath(import.meta.url)) === real(process.argv[1]);
if (isCli) main();

function main() {
const names = existsSync(modulesDir) ? readdirSync(modulesDir).filter((d) => statSync(join(modulesDir, d)).isDirectory()) : [];
const problems = names.flatMap((name) => [
  ...REQUIRED.filter((f) => !existsSync(join(modulesDir, name, f))).map((f) => `modules/${name}: missing ${f}`),
  ...unretained(name),
  ...undeclared(name),
  ...(new RegExp(`^/modules/${name}/\\s+\\S`, "m").test(owners) ? [] : [`modules/${name}: no CODEOWNERS line for /modules/${name}/`]),
]);

if (problems.length) {
  console.error(`module standard: ${problems.length} problem(s)\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee docs/module-standard.md.`);
  process.exit(2);
}
console.log(`module standard: ok (${names.length} modules)`);
}
