import { describe, expect, it } from "vitest";
import type { Viewer } from "@amax/auth";
import type { ModuleManifest } from "@amax/core";
import type { Registry } from "@amax/mcp";
import { pageInfo } from "../lib/page-context";

const Page = () => null;
const viewer = { userId: "u1" } as unknown as Viewer;
const registry = { toolsFor: () => [{ name: "fix" }, { name: "submit" }, { name: "read" }, { name: "broken" }] } as unknown as Registry;
const mods = [{
  id: "time", title: "Time", routes: [{ path: "", title: "Team time", component: Page }, { path: "my/:week", title: "My timesheet", component: Page }],
  pageLabel: (p: Record<string, string>) => (p.week ? `Week of ${p.week}` : null),
  chatSuggestions: [
    { routes: ["my/:week"], label: "Fix an entry", prompt: "Fix: ", tool: "fix", when: async (_v: never, p: Record<string, string>) => p.week === "2026-W42" },
    { routes: ["my/:week"], label: "Approve", prompt: "Approve", tool: "approve" },
    { routes: ["my/:week"], label: "Broken check", prompt: "x", tool: "broken", when: async () => { throw new Error("down"); } },
    { routes: ["my/:week"], label: "Submit", prompt: "Submit", tool: "submit" },
    { routes: ["my/:week"], label: "Read", prompt: "Read", tool: "read" },
    { routes: ["my/:week"], label: "Fourth", prompt: "Fourth", tool: "read" },
    { routes: [""], label: "Team only", prompt: "Team", tool: "read" },
  ],
}] as unknown as ModuleManifest[];

describe("070 amendment 4: the page chat is on", () => {
  it("AC40 and AC42 a path becomes the module, page, label and params; suggestions need the viewer's tool and a passing check, at most three; an unknown path gives nothing", async () => {
    expect(await pageInfo(mods, registry, viewer, "/time/my/2026-W42")).toEqual({ module: "time", page: "My timesheet", label: "My timesheet · Week of 2026-W42", params: { week: "2026-W42" },
      suggestions: [{ label: "Fix an entry", prompt: "Fix: " }, { label: "Submit", prompt: "Submit" }, { label: "Read", prompt: "Read" }] });
    expect((await pageInfo(mods, registry, viewer, "/time/my/2026-W41"))?.suggestions.map((s) => s.label)).toEqual(["Submit", "Read", "Fourth"]);
    expect((await pageInfo(mods, registry, viewer, "/time"))?.label).toBe("Team time");
    expect(await pageInfo(mods, registry, viewer, "/nowhere/at/all")).toBeNull();
    expect(await pageInfo(mods, registry, viewer, "/")).toBeNull();
  });
});
