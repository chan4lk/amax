import type { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";

export type Src = "mcp" | "chat";
export const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run"> & { input: I; run: (v: Viewer, input: z.infer<I>, source: Src) => Promise<unknown> }) => t as unknown as McpToolDef;
export const read = { scope: "read" as const, readOnly: true, permission: "allocations:read" };
