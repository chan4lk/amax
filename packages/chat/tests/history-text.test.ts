import { describe, expect, it } from "vitest";
import { shownMessages } from "../src/history";

// A reopened conversation shows what the person typed, never the pinned context the gateway put ahead of it for the model.
describe("history shows typed text only", () => {
  it("drops the Pinned context block from the person's message and keeps everything else", () => {
    const context = 'Pinned context:\n<data label="Current page">\n{"module":"time","page":"My timesheet"}\n</data>';
    expect(shownMessages([
      { role: "user", content: [{ type: "text", text: context }, { type: "text", text: "Change Thursday's Fleet\nTracker hours to 7" }] },
      { role: "assistant", content: [{ type: "text", text: "Pinned context: is how I'd describe it." }] },
    ] as never)).toEqual([
      { role: "me", text: "Change Thursday's Fleet\nTracker hours to 7" },
      { role: "amax", text: "Pinned context: is how I'd describe it." },
    ]);
  });
});
