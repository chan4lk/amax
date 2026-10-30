import type { Db } from "@amax/db";
import { ForbiddenError, logError, RateLimitedError, traceStep, ValidationError, withTrace } from "@amax/core/server";
import { ScopeError } from "@amax/auth";
import { bearer } from "@amax/auth/tokens";
import { ToolError, userFacing, type Registry } from "@amax/mcp";
import { CallerError, resolveCaller } from "./caller";
import { openApi } from "./openapi";

export const REST_BASE = "/api/v1";
type Deps = { db: Db; registry: Registry; base: string };

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function failure(e: unknown): Response {
  if (e instanceof CallerError) return json(e.status, { error: e.status === 401 ? "unauthorized" : "forbidden", message: e.message });
  if (e instanceof RateLimitedError) return json(429, { error: "rate_limited", message: e.message }, { "retry-after": String(e.retryAfter) });
  // One rule for what a caller may read (shared with bulk results, 070 review round 3); everything else is a 500.
  if (!userFacing(e)) return json(500, { error: "internal", ref: logError("api.rest", e).slice(0, 8) });
  if (e instanceof ToolError) return json({ not_found: 404, forbidden: 403, invalid_input: 400 }[e.code], { error: e.code, message: e.message });
  if (e instanceof ForbiddenError || e instanceof ScopeError) return json(403, { error: "forbidden", message: e.message });
  if (e instanceof ValidationError) return json(400, { error: "invalid_input", message: e.message });
  const code = (e as { code?: unknown } | null)?.code;
  if (code === "not_found" || code === "invalid_input") return json(code === "not_found" ? 404 : 400, { error: code, message: (e as Error).message });
  // 060 AC-6: a domain refusal (PrivacyError and the like declare retryable = false) is the caller's to
  // act on, with its message, not a server failure.
  return json(409, { error: "refused", message: e.message });
}

async function body(req: Request) {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ToolError("the body must be JSON", "invalid_input");
  }
}

async function callTool(req: Request, deps: Deps, name: string) {
  const tool = deps.registry.all.find((t) => t.name === name);
  if (!tool) throw new ToolError(`no tool named ${name}`, "not_found");
  if (tool.secretInput) throw new ToolError(`${name} takes a typed value; use amax chat's confirm card`, "invalid_input");
  const caller = await resolveCaller(deps.db, bearer(req), tool, req.headers.get("amax-act-for"));
  const args = await body(req);
  const result = await withTrace(caller.trace, async () => {
    await traceStep({ kind: "mcp_call", tool: name, args: args ?? {}, detail: { transport: "rest", principal: caller.principal?.name ?? null } });
    return deps.registry.call(caller.viewer, name, args, { source: "api", token: caller.token });
  });
  return json(200, { result });
}

export async function handleRest(req: Request, deps: Deps): Promise<Response> {
  const path = new URL(req.url).pathname.slice(REST_BASE.length);
  try {
    if (path === "/openapi.json" && req.method === "GET") return json(200, openApi(deps.registry, deps.base));
    const tool = path.match(/^\/tools\/([a-z0-9_]+)$/)?.[1];
    if (tool && req.method === "POST") return await callTool(req, deps, tool);
    return json(404, { error: "not_found", message: `no route ${req.method} ${REST_BASE}${path}` });
  } catch (e) {
    return failure(e);
  }
}
