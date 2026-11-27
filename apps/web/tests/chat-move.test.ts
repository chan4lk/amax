import { describe, expect, it } from "vitest";
import { withFresh } from "@amax/chat/pins";
import { followMove, movedOf } from "../lib/chat-move";

const moved = { from: "/delivery/releases/CON/v2.4.0", to: "/delivery/releases/CON/v2.4.1" };

// 057: after a confirmed re-tag, the release page follows the release to its new URL.
describe("057 chat follows a renamed record's page", () => {
  it.each([
    ["on the old page", "/delivery/releases/CON/v2.4.0", moved, moved.to],
    ["on the old page, percent-encoded", "/delivery/releases/CON/v2%2E4%2E0", moved, moved.to],
    ["on another page", "/delivery/releases", moved, null],
    ["on another release", "/delivery/releases/CON/v2.3.0", moved, null],
    ["with nothing moved", "/delivery/releases/CON/v2.4.0", undefined, null],
  ])("%s", (_n, path, m, want) => expect(followMove(path, m)).toBe(want));

  it.each([
    ["a tag result", { version: "v2.4.1", moved }, moved],
    ["a result with no move", { key: "CON-1" }, undefined],
    ["no result", null, undefined],
    ["another site", { moved: { from: moved.from, to: "https://evil.example/x" } }, undefined],
    ["a protocol-relative URL", { moved: { from: moved.from, to: "//evil.example/x" } }, undefined],
    ["a backslash URL", { moved: { from: moved.from, to: "/\\evil.example" } }, undefined],
    ["a tab after the slash (124)", { moved: { from: moved.from, to: "/\t/evil.example" } }, undefined],
    ["a newline after the slash (124)", { moved: { from: moved.from, to: "/\n/evil.example" } }, undefined],
    ["a control character (124)", { moved: { from: "/\u0000/evil.example", to: moved.to } }, undefined],
  ])("movedOf: %s", (_n, result, want) => expect(movedOf(result)).toEqual(want));
});


// 059: the panel takes the pins as the server read them, keeping any pin added or removed meanwhile.
describe("059 the chat panel takes refreshed pins into its current pins", () => {
  const rel = (version: string) => ({ label: `CON ${version}`, tool: "get_release_history", args: { releaseId: "r-1" }, facet: " proposals" });
  const old = { label: "CON v2.3.0", tool: "get_release", args: { projectKey: "CON", version: "v2.3.0" } };
  const moved = { label: "Contoso Portal v2.3.0", tool: "get_release", args: { releaseId: "r-0" } };
  const added = { label: "CON-017 CSV import", tool: "get_proposal", args: { proposalId: "p-17" } };
  const sent = [rel("v2.4.0"), old];
  const fresh = [rel("v2.4.1"), moved];
  it.each([
    ["a pin added since it was sent stays", [...sent, added], [rel("v2.4.1"), moved, added]],
    ["a pin removed since it was sent stays removed", [old], [moved]],
    ["the panel's order is kept", [added, old, rel("v2.4.0")], [added, moved, rel("v2.4.1")]],
  ])("%s", (_n, panel, want) => expect(withFresh(panel, sent, fresh)).toEqual(want));
});
