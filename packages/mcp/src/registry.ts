import { z } from "zod";
import type { McpToolDef, ModuleManifest, SearchHit } from "@amax/core";
import { enforceRate, ForbiddenError, traceStep, ValidationError } from "@amax/core/server";
import { canEver, rolesOf, ScopeError, type Viewer } from "@amax/auth";
import { auditTools } from "./audit-tools";

export type Scope = McpToolDef["scope"];
export const ALL_SCOPES: Scope[] = ["read", "write", "sensitive"];
export type RegisteredTool = McpToolDef & { module: string };

export class ToolError extends Error {
  readonly retryable = false;
  constructor(message: string, public code: "not_found" | "forbidden" | "invalid_input") {
    super(message);
    this.name = "ToolError";
  }
}

/**
 * Whether an error is a refusal written for the caller, so its message may be shown: the REST API's rule, shared
 * with anything else that reports a failure (070 review round 3). Anything else is logged and shown as a reference.
 */
export function userFacing(e: unknown): e is Error {
  if (!(e instanceof Error)) return false;
  if (e instanceof ToolError || e instanceof ForbiddenError || e instanceof ScopeError || e instanceof ValidationError) return true;
  const { code, retryable } = e as { code?: unknown; retryable?: unknown };
  return code === "not_found" || code === "invalid_input" || retryable === false;
}

type Registrable = Pick<ModuleManifest, "id" | "mcpTools" | "search">;

// Built in: who am I, and search across every module that contributes results (AC-3).
function builtins(modules: Registrable[]): RegisteredTool[] {
  return [
    {
      module: "core", name: "whoami", description: "The signed-in user, tenant and roles.", input: z.object({}).strict(), permission: "", scope: "read", readOnly: true,
      run: async (viewer: Viewer) => ({ userId: viewer.userId, name: viewer.name, email: viewer.email, tenantId: viewer.tenantId, roles: rolesOf(viewer), viewAs: viewer.viewAs ?? null }),
    } as unknown as RegisteredTool,
    {
      module: "core", name: "search", description: "Search projects, proposals and other records by text.", input: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }).strict(),
      permission: "", scope: "read", readOnly: true,
      run: async (viewer: Viewer, input: { query: string; limit?: number }) => {
        // A module the viewer may not read contributes nothing; any other failure is reported, not
        // dressed up as "no matches" (review round 1). One shape every time (review round 2).
        const notSearched: string[] = [];
        const results = await Promise.all(modules.filter((m) => m.search).map((m) => m.search!(viewer as never, input.query).catch((e: unknown) => {
          if (!(e instanceof ForbiddenError || e instanceof ScopeError)) notSearched.push(m.id);
          return [] as SearchHit[];
        })));
        return { hits: results.flat().slice(0, input.limit ?? 20), notSearched };
      },
    } as unknown as RegisteredTool,
    ...auditTools(),
  ];
}

// 059: a pin on a record tool resolves by the record's UUID, so a rename can't strand it. Checked
// when the registry is built (startup), so a tool without an id path never ships.
const uuidField = (input: z.ZodType, field: string) => {
  let f = (input as { shape?: Record<string, z.ZodType> }).shape?.[field] as (z.ZodType & { unwrap?: () => z.ZodType; format?: string | null }) | undefined;
  while (f && f._zod.def.type === "optional") f = f.unwrap!() as typeof f;
  return f?.format === "uuid";
};
export function checkPinSpec(t: Pick<RegisteredTool, "name" | "scope" | "input" | "pin">) {
  if (!t.pin) return;
  if (t.scope !== "read") throw new Error(`MCP tool "${t.name}" resolves pins but isn't a read tool`);
  if (t.pin === "view") return;
  if (!uuidField(t.input, t.pin.id)) throw new Error(`MCP tool "${t.name}" resolves pins but has no id path: its input "${t.pin.id}" must be a UUID`);
}

export function createRegistry(modules: Registrable[]) {
  const tools: RegisteredTool[] = [...builtins(modules), ...modules.flatMap((m) => (m.mcpTools ?? []).map((t) => ({ ...t, module: m.id })))];
  const seen = new Set<string>();
  for (const t of tools) {
    if (seen.has(t.name)) throw new Error(`MCP tool "${t.name}" is declared twice`);
    seen.add(t.name);
    checkPinSpec(t);
    // 043 AC-1: every write tool says which service makes its write, or null when chat can't confirm it.
    if (t.scope === "write" && t.service === undefined) throw new Error(`MCP write tool "${t.name}" declares no service (null if it can't be confirmed in chat)`);
  }
  const allowed = (viewer: Viewer, t: RegisteredTool, scopes: Scope[]) => scopes.includes(t.scope) && (!t.permission || canEver(viewer, t.permission));

  return {
    all: tools,
    /** Only tools this viewer's roles and this token's scopes allow (AC-3). */
    toolsFor: (viewer: Viewer, scopes: Scope[] = ALL_SCOPES) => tools.filter((t) => allowed(viewer, t, scopes)),
    /** Re-checks access, validates input and runs the tool; module services do the record-level checks and audit. */
    async call(viewer: Viewer, name: string, args: unknown, opts: { scopes?: Scope[]; source: "mcp" | "chat" | "api"; secret?: string; token?: string }) {
      enforceRate({ tenantId: viewer.tenantId, userId: viewer.userId, token: opts.token, channel: opts.source === "api" ? "rest" : opts.source });
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new ToolError(`no tool named ${name}`, "not_found");
      // 050: inside a trace (chat turn, confirm, MCP call) every tool call is a step, refusals included.
      // traceStep is best-effort (053), so recording the step never changes what the caller is told.
      // The audited write still carries the trace id, so a missing step shows in the timeline.
      const step = (outcome: string) => traceStep({ kind: "tool_call", tool: name, args: args ?? {}, detail: { scope: tool.scope, outcome } });
      if (!allowed(viewer, tool, opts.scopes ?? ALL_SCOPES)) {
        await step("denied");
        throw new ToolError(`forbidden: ${name}`, "forbidden");
      }
      const parsed = tool.input.safeParse(args ?? {});
      if (!parsed.success) await step("invalid_input");
      if (!parsed.success) throw new ToolError(`invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`, "invalid_input");
      let result: unknown;
      try {
        result = await tool.run(viewer as never, parsed.data as never, opts.source, tool.secretInput ? opts.secret : undefined);
      } catch (e) {
        await step(e instanceof ForbiddenError || e instanceof ScopeError ? "denied" : "error");
        throw e;
      }
      // Outside the try, so the tool's own errors are the only ones the catch sees.
      await step("ok");
      return result;
    },
  };
}

export type Registry = ReturnType<typeof createRegistry>;
