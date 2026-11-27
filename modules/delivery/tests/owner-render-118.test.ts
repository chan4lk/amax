import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb } from "@amax/db/testdb";
import { setGrants, type Viewer } from "@amax/auth";
import delivery from "../module";
import { ctxFor } from "../server/context";
import { createProposal } from "../server/services";
import { proposalOffers } from "../server/pin-offers";
import { updateCard } from "../server/proposal-card";
import { ProposalsPage } from "../ui/ProposalsPage";
import { proposalDb } from "./proposal-db";

const render = async (node: unknown) => (await import("react-dom/server")).renderToStaticMarkup((await node) as never);

// 118 (review round 1): every place an ownerless proposal's owner shows reads one rule: "Unassigned" (a warning) only
// while it's open; a released or withdrawn one is "Not recorded" (muted), and nobody is offered to take it.
describe.skipIf(!hasDb)("118 the owner label on every screen (Postgres)", () => {
  let db: Awaited<ReturnType<typeof proposalDb>>;
  let maya: Viewer, nimal: Viewer;
  beforeAll(async () => { db = await proposalDb(); setGrants([delivery]); [maya, nimal] = [await db.as("maya"), await db.as("nimal")]; }, 120_000);
  afterAll(() => db?.t.drop());

  it.each([
    ["an open (proposed) proposal", "proposed", false, "Unassigned"],
    ["a released proposal", "released", false, "Not recorded"],
    ["a withdrawn proposal", "proposed", true, "Not recorded"],
  ])("AC2 %s with no owner: %s, %s, %s", async (_n, phase, withdrawn, label) => {
    const { key } = await createProposal(ctxFor(maya), { projectKey: "CON", title: `Owner label ${phase} ${String(withdrawn)}` });
    await db.t.owner`update delivery.proposal set owner_user_id = null, owner_name = null, phase = ${phase},
      withdrawn_at = ${withdrawn ? new Date() : null}, withdrawn_by = ${withdrawn ? "test" : null}, withdraw_reason = ${withdrawn ? "Client dropped it" : null} where key = ${key}`;
    const open = label === "Unassigned";
    const page = await render(ProposalsPage({ viewer: maya, params: { phase: key } }));
    expect(page.includes(open ? '<span class="chip warn">Unassigned</span>' : '<span class="muted">Not recorded</span>')).toBe(true);
    expect(page.includes(open ? "Not recorded" : '<span class="chip warn">Unassigned</span>')).toBe(false);
    const list = await render(ProposalsPage({ viewer: maya, params: {}, searchParams: { q: key } }));
    // Lists leave withdrawn proposals out; any row that is listed shows the same label.
    if (list.includes(`href="/delivery/proposals/${key}"`)) expect(list).toContain(`<td data-label="Owner"><span class="muted">${label}</span>`);
    const from = (await updateCard(maya, { key, ownerUserId: nimal.userId })).lines.find((l) => l.label === "From")!.value;
    expect(from).toBe(label);
    expect((await proposalOffers(maya, { key })).some((o) => o.label.startsWith("Make me the owner"))).toBe(open);
  });
});
