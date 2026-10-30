import type { ModuleManifest, NavEntry } from "@amax/core";
import type { NavItem } from "@amax/ui";
import { modules } from "../generated/modules";
import { setInstalledModules } from "@amax/core/server";
import { OPERATIONS } from "./operations";

const GROUPS = ["Work", "People", "Business", "Operations"];
const rank = (group?: string) => (group ? GROUPS.indexOf(group) : -1);
const ordered = (mods: readonly ModuleManifest[]) => [...mods].sort((a, b) => rank(a.group) - rank(b.group) || (a.order ?? 50) - (b.order ?? 50) || a.id.localeCompare(b.id));

export const installed: ModuleManifest[] = ordered(modules);
// 072: what hasModule answers for this deployment (AMAX_MODULES_DISABLED is already out of the generated list).
setInstalledModules(installed.map((m) => m.id));

const inRail = (n: NavEntry) => n.parent !== "settings";

// A module's root entry, then its optional nav[] entries (041) right after it. Only the root can be
// primary (the mobile bar), as in the mock. 038 AC-1: entries are sorted into one heading per group in
// a fixed order (an entry may name its own group), whatever order the modules were found in.
export const moduleNav = (mods: readonly ModuleManifest[]): NavItem[] =>
  ordered(mods)
    .flatMap((m) => [
      ...(m.menu === "profile" ? [] : [{ href: `/${m.id}`, label: m.title, icon: m.icon, group: m.group, primary: m.primary }]),
      ...(m.nav ?? []).filter(inRail).map((n) => ({ href: `/${m.id}/${n.path}`, label: n.title, icon: n.icon, group: n.group ?? m.group })),
    ])
    .sort((a, b) => rank(a.group) - rank(b.group));

/** 038 AC-2: module screens that live under Settings, as hub cards rather than rail items. */
export const settingsEntries = (mods: readonly ModuleManifest[]) =>
  ordered(mods).flatMap((m) => (m.nav ?? []).filter((n) => !inRail(n)).map((n) => ({ module: m.id, moduleTitle: m.title, href: `/${m.id}/${n.path}`, title: n.title, blurb: n.blurb ?? "", status: n.status })));

export const settingsPaths = settingsEntries(installed).map((e) => e.href);

export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: "home", primary: true },
  // 006: every agent suggestion a person may decide; "suggestions:read" is granted to every role.
  { href: "/suggestions", label: "Suggestions", icon: "spark" },
  ...moduleNav(installed),
  // 047, 055: the Operations group: the Settings hub ("settings:read") and the screens still to come
  // ("operations:read"). Admin and IT Admin hold both, so visibleNav shows the group only to them.
  // 038 AC-4: shown to anyone who may open one of its screens (HR: Data retention).
  { href: "/settings", label: "Settings", icon: "gear", group: "Operations", hub: true },
  // A screen that has shipped as a module (036's Compliance) replaces its "Coming soon" entry; switching the module off brings it back.
  ...OPERATIONS.filter((o) => !installed.some((m) => m.id === o.slug)).map((o) => ({ href: `/operations/${o.slug}`, label: o.title, icon: o.icon, group: "Operations" })),
];

// Module screens reached from the profile menu instead of the rail (030's Notifications).
export const menuItems: NavItem[] = installed.filter((m) => m.menu === "profile").map((m) => ({ href: `/${m.id}`, label: m.title, icon: m.icon, group: m.group }));

// Controls modules add to the top bar (030's bell).
export const topBarControls = installed.flatMap((m) => (m.topBar ? [{ id: m.id, Control: m.topBar }] : []));

// Routes match segment by segment; ":name" segments become params.
export function matchRoute(pattern: string, path: string[]): Record<string, string> | null {
  const parts = pattern ? pattern.split("/") : [];
  if (parts.length !== path.length) return null;
  const params: Record<string, string> = {};
  for (const [i, part] of parts.entries()) {
    // Next has already decoded each segment (route-matcher decodes catch-all entries); decoding
    // again would turn a literal "%41" into "A" (final review).
    if (part.startsWith(":")) params[part.slice(1)] = path[i];
    else if (part !== path[i]) return null;
  }
  return params;
}

// Routes other modules mount under `id` (051) come first, so they replace the owner's fallback.
export function routeIn(mods: ModuleManifest[], id: string, path: string[] = []) {
  const mod = mods.find((m) => m.id === id);
  if (!mod) return null;
  const mounted = mods.flatMap((m) => m.routes.filter((r) => r.mount === id));
  for (const route of [...mounted, ...mod.routes.filter((r) => !r.mount)]) {
    const params = matchRoute(route.path, path);
    if (params) return { mod, route, params };
  }
  return null;
}

export const findRoute = (id: string, path: string[] = []) => routeIn(installed, id, path);
