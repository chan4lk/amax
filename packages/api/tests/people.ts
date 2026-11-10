import { z } from "zod";
import { withTenant, type Db } from "@amax/db";
import { defineService } from "@amax/core/server";
import type { McpToolDef } from "@amax/core";
import { contextForViewer, createApiToken, setGrants, upsertPasswordUser, viewerForUser, type Viewer } from "@amax/auth";
import { createRegistry } from "@amax/mcp";

const addNote = defineService({
  name: "demo.note.add",
  action: "demo:note:add",
  resource: "demo.note",
  input: z.object({ text: z.string().min(1) }),
  run: async (_tx, input) => {
    if (input.text === "refuse") throw Object.assign(new Error("notes about this are refused (fictional rule)"), { retryable: false });
    if (input.text === "crash") throw new Error("internal detail that must not leak");
    if (input.text === "unavailable") throw Object.assign(new Error("the module that answers this is switched off (fictional)"), { retryable: true, code: "unavailable" });
    return { result: { saved: input.text }, resourceId: "note-1", after: input };
  },
});

const tools = [
  { name: "add_note", description: "Add a note.", input: z.object({ text: z.string().min(1) }).strict(), permission: "demo:note:add", scope: "write", service: addNote,
    run: (v: Viewer, a: { text: string }, source: "api") => addNote(contextForViewer(v, source), a) },
] as unknown as McpToolDef[];

export const demoRegistry = () => createRegistry([{ id: "demo", mcpTools: tools }]);

export async function person(db: Db, tenantId: string, key: string, roles: ("Admin" | "Engineer" | "Sales")[]) {
  setGrants([{ grants: { Engineer: ["demo:note:add"] } }]);
  const id = await upsertPasswordUser(db, tenantId, { email: `${key}@example.test`, name: key, roles, password: `${key}-password-123` });
  const viewer = (await withTenant(db, tenantId, (tx) => viewerForUser(tx, tenantId, id)))!;
  const token = await createApiToken(db, viewer, { kind: "api", name: `${key} laptop`, days: 30 });
  return { id, viewer, token };
}

export const rest = (path: string, init: { token?: string; actFor?: string; body?: unknown; method?: string } = {}) =>
  new Request(`http://localhost/api/v1${path}`, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), ...(init.actFor ? { "amax-act-for": init.actFor } : {}) },
    body: init.method === "GET" ? undefined : JSON.stringify(init.body ?? {}),
  });
