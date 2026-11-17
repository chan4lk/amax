type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
const inline = (v: unknown): string => (empty(v) ? "" : typeof v === "object" ? JSON.stringify(v) : String(v).replace(/\|/g, "/").replace(/\n/g, " "));
const indent = (s: string) => s.split("\n").map((l) => `  ${l}`).join("\n");

function table(rows: Obj[]) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => rows.some((r) => !empty(r[k])));
  return [`| ${keys.join(" | ")} |`, `|${keys.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${keys.map((k) => inline(r[k])).join(" | ")} |`)].join("\n");
}

export function compact(v: unknown): string {
  if (Array.isArray(v)) {
    if (!v.length) return "(none)";
    return v.every(isObj) ? table(v) : v.map((x) => `- ${compact(x)}`).join("\n");
  }
  if (isObj(v)) {
    return Object.entries(v).filter(([, x]) => !empty(x))
      .map(([k, x]) => (typeof x === "object" ? `${k}:\n${indent(compact(x))}` : `${k}: ${inline(x)}`)).join("\n");
  }
  return inline(v);
}
