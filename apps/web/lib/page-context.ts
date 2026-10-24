import type { Viewer } from "@amax/auth";
import type { ChatSuggestion, ModuleManifest } from "@amax/core";
import type { Registry } from "@amax/mcp";
import { routeIn } from "./registry";

// 070 amendment 4: where the person is, as chat sees it. The path is matched against installed routes on the
// server; the page is context for the model, never permission (every tool keeps its own checks).
export type PageSuggestion = { label: string; prompt: string };
export type PageInfo = { module: string; page: string; label: string; params: Record<string, string>; suggestions: PageSuggestion[] };

const MAX_SUGGESTIONS = 3;

function segments(path: string): string[] | null {
  try {
    return path.split("?")[0].split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  } catch {
    return null;
  }
}

async function usable(s: ChatSuggestion, viewer: Viewer, params: Record<string, string>, tools: Set<string>) {
  if (!tools.has(s.tool)) return false;
  try {
    return s.when ? await s.when(viewer as never, params) : true;
  } catch {
    return false;
  }
}

export async function pageInfo(mods: ModuleManifest[], registry: Registry, viewer: Viewer, path: string): Promise<PageInfo | null> {
  const parts = segments(path);
  if (!parts?.length) return null;
  const found = routeIn(mods, parts[0], parts.slice(1));
  if (!found) return null;
  const owner = mods.find((m) => m.routes.includes(found.route)) ?? found.mod;
  const tools = new Set(registry.toolsFor(viewer).map((t) => t.name));
  const offered = (owner.chatSuggestions ?? []).filter((s) => s.routes.includes(found.route.path));
  const checks = await Promise.all(offered.map((s) => usable(s, viewer, found.params, tools)));
  const label = [found.route.title, owner.pageLabel?.(found.params)].filter(Boolean).join(" · ");
  return { module: owner.id, page: found.route.title, label, params: found.params,
    suggestions: offered.filter((_, i) => checks[i]).slice(0, MAX_SUGGESTIONS).map(({ label: l, prompt }) => ({ label: l, prompt })) };
}
