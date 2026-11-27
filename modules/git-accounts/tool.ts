import type { z } from "zod";
import type { McpToolDef } from "@amax/core";
import type { Viewer } from "@amax/auth";

type Src = "mcp" | "chat" | "api";
/** The module's tools, typed against their input: `run` gets the viewer, the parsed input, the source and, for a tool
 * with a masked field (`secretInput`), what the person typed there. */
export const tool = <I extends z.ZodType>(t: Omit<McpToolDef, "input" | "run" | "propose" | "card"> & {
  input: I;
  run: (v: Viewer, input: z.infer<I>, source: Src, secret?: string) => Promise<unknown>;
  propose?: (v: Viewer, input: z.infer<I>) => Promise<void>;
  card?: (v: Viewer, input: z.infer<I>) => Promise<import("@amax/core").ToolCard>;
}) => t as unknown as McpToolDef;
