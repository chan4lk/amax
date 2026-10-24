import { describe, expect, it } from "vitest";
import { commitsOf } from "../server/ingest";

describe("071 AC-7 a push's repeated commits are skipped", () => {
  it("AC7 GitHub commits with distinct: false (already pushed on another ref) aren't ingested; others are, as before", () => {
    const headers = new Headers({ "x-github-event": "push" });
    const commits = [{ id: "a1", distinct: true }, { id: "b2", distinct: false }, { id: "c3" }].map((c) => ({ ...c, message: "CON-014 2h", author: { username: "nimal" } }));
    expect(commitsOf("github", headers, { commits })?.map((c) => c.id)).toEqual(["a1", "c3"]);
  });
});
