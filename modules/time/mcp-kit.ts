import { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";

// Shared by mcp.ts and mcp-requests.ts: a typed tool, the read defaults, and the ISO week shape.
export type Src = "mcp" | "chat";
export const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
export const read = { scope: "read" as const, readOnly: true, permission: "time:read" };
export const isoWeek = z.string().regex(/^\d{4}-W\d{2}$/);
