import { sql } from "drizzle-orm";
import { withTenant } from "@amax/db";
import type { Viewer } from "@amax/auth";
import type { CardField, ToolCard } from "@amax/core";
import { getRuntime } from "@amax/core/server";
import { normaliseRepo } from "../sync/repo-url";
import { DEFAULT_BRANCH } from "./repo-sync";
import type { SetUp } from "./set-up-project";

const BILLING = [{ value: "fixed", label: "Fixed" }, { value: "t&m", label: "T&M" }, { value: "retainer", label: "Retainer" }, { value: "internal", label: "Internal" }];

export const repoFields = (selected = DEFAULT_BRANCH): CardField[] => [
  { name: "repoUrl", label: "Repo URL", kind: "text" },
  { name: "defaultBranch", label: "Branch", kind: "chips", value: selected, options: [...new Set([selected, DEFAULT_BRANCH])].map((b) => ({ value: b, label: b })), other: "other…", required: true },
];

export const storedLink = async (v: Viewer, projectKey: string) => (await withTenant(getRuntime().db, v.tenantId, (tx) =>
  tx.execute(sql`select repo_url, repo_default_ref from delivery.project where key = ${projectKey}`)))[0] as { repo_url: string | null; repo_default_ref: string | null } | undefined;

const clientsOf = (v: Viewer) => withTenant(getRuntime().db, v.tenantId, (tx) =>
  tx.execute(sql`select client from delivery.project where client <> 'Internal' group by client order by count(*) desc, client limit 4`));

export const repoDone = (repoUrl?: string, branch?: string) => {
  if (!repoUrl) return "";
  try { return `, linked ${normaliseRepo(repoUrl)} (${branch ?? DEFAULT_BRANCH})`; } catch { return `, linked ${repoUrl}`; }
};

export async function setUpProjectCard(v: Viewer, a: Partial<SetUp>): Promise<ToolCard> {
  const key = a.key ?? "the project";
  const clients = (await clientsOf(v)).map((r) => String(r.client));
  return {
    title: `Set up ${key}${a.name ? ` · ${a.name}` : ""}`,
    lines: [],
    look: { kind: "Set up a project", who: "PM: You", confirm: `Create ${key}`, done: `Created ${key} · ${a.name ?? ""}${repoDone(a.repoUrl, a.defaultBranch)}`,
      ...(a.key ? { next: { label: "Add your team?", prompt: `Add someone to ${a.key}` } } : {}) },
    form: {
      fields: [
        { name: "name", label: "Name", kind: "text" },
        { name: "key", label: "Key", kind: "text", upper: true, follow: "name", hint: "✓ free · proposal ids {value}-001 · the key can't change later" },
        { name: "client", label: "Client", kind: "chips", options: ["Internal", ...clients].map((c) => ({ value: c, label: c })), other: "+ new…" },
        { name: "billing", label: "Billing", kind: "chips", options: BILLING },
        ...repoFields(),
      ],
      optional: { label: "Repo (optional)", fields: ["repoUrl", "defaultBranch"] },
      confirm: { label: "Create {key} and link repo", unless: { field: "repoUrl", label: "Create {key}" } },
    },
  };
}
