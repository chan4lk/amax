import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { ForbiddenError, setProvided } from "@amax/core/server";
import { can } from "@amax/auth";
import { hasDb } from "@amax/db/testdb";
import { PROJECT_HEADER_SLOT, type ProjectHeaderSlot } from "@amax/delivery/contracts";
import { ProjectTeamPage } from "../ui/ProjectTeamPage";
import { allocationsDatabase } from "./setup";

const head = { project: { key: "CON", name: "Contoso Portal" }, lede: "Released means it reached Prod." };
const Header: ProjectHeaderSlot["Header"] = () => null;
const slot = (load: ProjectHeaderSlot["load"]): ProjectHeaderSlot => ({ load, Header });

function find(node: ReactNode, match: (el: { type: unknown; props: Record<string, unknown> }) => boolean): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) { for (const n of node) { const hit = find(n, match); if (hit) return hit; } return null; }
  if (!isValidElement(node)) return null;
  const el = node as unknown as { type: unknown; props: Record<string, unknown> };
  return match(el) ? el : find(el.props.children as ReactNode, match);
}
const text = (node: ReactNode): string => JSON.stringify(node, (_k, v) => (typeof v === "function" ? undefined : v));

describe.skipIf(!hasDb)("122 the Team page and Delivery's header slot (Postgres)", () => {
  let db: Awaited<ReturnType<typeof allocationsDatabase>>;
  beforeAll(async () => { db = await allocationsDatabase(); }, 60_000);
  afterAll(() => db?.t.drop());
  afterEach(() => setProvided([]));

  it.each([
    ["no module fills the slot", [] as { id: string; provides: Record<string, unknown> }[], false],
    ["the slot finds no project", [{ id: "delivery", provides: { [PROJECT_HEADER_SLOT]: slot(async () => null) } }], false],
    ["the slot finds it", [{ id: "delivery", provides: { [PROJECT_HEADER_SLOT]: slot(async () => head) } }], true],
  ])("AC1 %s: the page has its shared header, or it is Project not found, never a page without one", async (_name, modules, shown) => {
    setProvided(modules);
    const page = await ProjectTeamPage({ viewer: await db.as("maya"), params: { key: "CON" } } as never);
    const header = find(page, (el) => el.type === Header);
    expect(Boolean(header)).toBe(shown);
    expect(text(page).includes("Project not found")).toBe(!shown);
    if (header) expect(header.props).toMatchObject({ head, section: "team", title: "Team" });
  });

  it("AC1 someone with Allocations but not Projects (HR) gets a role message, never a crash or Project not found", async () => {
    const hr = { ...(await db.as("sarah")), viewAs: undefined, assignments: [{ role: "HR" as const, legalEntityIds: null, departments: null }] };
    expect(can(hr, "allocations:read") && !can(hr, "delivery:read")).toBe(true);
    setProvided([{ id: "delivery", provides: { [PROJECT_HEADER_SLOT]: slot(async () => { throw new ForbiddenError("delivery:read", "delivery.project"); }) } }]);
    const page = await ProjectTeamPage({ viewer: hr, params: { key: "CON" } } as never);
    expect(text(page)).toContain("Projects aren't open to your role");
    expect(text(page)).not.toContain("Project not found");
  });
});
