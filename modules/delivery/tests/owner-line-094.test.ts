import { describe, expect, it } from "vitest";
import { ownerFromHeader } from "../sync/owner-line";

const change = (line: string) => `# A change\n\n**Change:** 611-owner\n${line}\n\n## Problem\n\n**Owner:** later@lumenlabs.test\n`;

// 094 AC-5: the Owner line is read by tokens. Every form 091–093 handled, plus the ones a single pattern kept missing.
describe("094 AC-5 the Owner line, by tokens", () => {
  it.each([
    ["bare", "**Owner:** nimal@lumenlabs.test", "nimal@lumenlabs.test"],
    ["a trailing comma", "**Owner:** nimal@lumenlabs.test,", "nimal@lumenlabs.test"],
    ["a name and a bracketed address, full stop", "**Owner:** Nimal Silva <nimal@lumenlabs.test>.", "nimal@lumenlabs.test"],
    ["a markdown mailto link", "**Owner:** [nimal@lumenlabs.test](mailto:nimal@lumenlabs.test)", "nimal@lumenlabs.test"],
    ["a mailto link with other text", "**Owner:** [Nimal](mailto:nimal@lumenlabs.test)", "nimal@lumenlabs.test"],
    ["a semicolon and a note", "**Owner:** nimal@lumenlabs.test; backend lead", "nimal@lumenlabs.test"],
    ["inside parentheses", "**Owner:** (nimal@lumenlabs.test)", "nimal@lumenlabs.test"],
    ["an apostrophe in the address", "**Owner:** o'brien@lumenlabs.test", "o'brien@lumenlabs.test"],
    ["a ! in the address, bracketed", "**Owner:** Ann <a!b@lumenlabs.test>", "a!b@lumenlabs.test"],
    ["a plus tag, in backticks", "**Owner:** `first+tag@lumenlabs.test`", "first+tag@lumenlabs.test"],
    ["single quotes", "**Owner:** 'nimal@lumenlabs.test'", "nimal@lumenlabs.test"],
    ["double quotes", '**Owner:** "nimal@lumenlabs.test"', "nimal@lumenlabs.test"],
    ["bold markup", "**Owner:** **nimal@lumenlabs.test**", "nimal@lumenlabs.test"],
    ["italic markup", "**Owner:** _nimal@lumenlabs.test_", "nimal@lumenlabs.test"],
    ["straight after the label", "**Owner:**a@b.test", "a@b.test"],
    ["a trailing full stop after the domain", "**Owner:** a@b.test.", "a@b.test"],
    ["a trailing ! after the domain", "**Owner:** a@b.testx!", "a@b.testx"],
    ["on the same line as other header fields", "**Lane:** core · **Owner:** nimal@lumenlabs.test · **Review:** change", "nimal@lumenlabs.test"],
    ["a name with no address", "**Owner:** Nimal Silva", null],
    ["a broken address", "**Owner:** nimal@lumenlabs", null],
    ["no Owner line in the header (one below it doesn't count)", "**Lane:** core", null],
  ])("%s", (_, line, email) => {
    expect(ownerFromHeader(change(line))).toBe(email);
  });
});
