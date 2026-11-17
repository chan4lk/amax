import { describe, expect, it } from "vitest";
import { cardTools, echoOf, openCardsNote } from "../src/cards";
import type { PendingAction } from "../src";

const card = (id: string, percent: number): PendingAction => ({ id, tool: "allocate", title: "Allocate", input: { person: "Kasun Dias", projectKey: "FLT", month: "2026-12", percent }, fields: [], createdAt: new Date().toISOString() });

describe("waiting changes by typing", () => {
  it("AC33 numbers the waiting changes, changes or drops one by its number, and says what it did", async () => {
    const open = [card("a", 50), card("b", 30)];
    expect(openCardsNote(open)).toContain("2. Kasun Dias on FLT, Dec 2026: 30%");
    const done: string[] = [];
    const [change, drop] = cardTools(open, { edit: async (id, ch) => { done.push(`edit ${id} ${JSON.stringify(ch)}`); return card(id, Number(ch.percent)); }, drop: async (id) => { done.push(`drop ${id}`); } });
    const run = (t: unknown, a: unknown) => (t as { run: (a: unknown) => Promise<unknown> }).run(a);
    expect(await run(change, { card: 1, changes: { percent: 40 } })).toEqual({ status: "changed", now: "Kasun Dias on FLT, Dec 2026: 40%" });
    expect(await run(drop, { card: 2 })).toEqual({ status: "dropped" });
    expect(await run(drop, { card: 9 })).toMatchObject({ status: "not_changed" });
    expect(done).toEqual(['edit a {"percent":40}', "drop b"]);
    expect(echoOf([card("a", 40)], 1)).toBe("Now: Kasun Dias on FLT, Dec 2026: 40%. Dropped that one.\nPress Add all if that looks right, or tell me what to change.");
  });
});
