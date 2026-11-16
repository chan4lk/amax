import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "../src/log";

describe("logError keeps content out of logs", () => {
  afterEach(() => vi.restoreAllMocks());
  it.each([
    ["a JSON parse error quoting the body", (() => { try { JSON.parse('{"password":"hunter2"'); } catch (e) { return e; } })()],
    ["a TypeError with user text", new TypeError("cannot read 'secret-from-user' of undefined")],
    ["a model output in a message", new Error("model said: here is the admin password")],
    ["a thrown string", "raw secret string"],
  ])("%s", (_name, err) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = logError("test", err);
    const line = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(line).toMatch(new RegExp(id));
    expect(line).not.toMatch(/hunter2|secret|password/);
  });

  // 114 AC-2: a scope or an error code can't start a second log line.
  it.each([
    ["a newline in the scope", "chat\nFAKE amax admin: ok", new Error("x")],
    ["a newline in the error's code", "chat", Object.assign(new Error("x"), { code: "E1\r\nFAKE line" })],
    ["a newline in the error's name", "chat", Object.assign(new Error("x"), { name: "Error\nFAKE amax admin: ok" })],
    ["a thrown object with a newline in its code", "chat", { code: "E2\nFAKE line" }],
  ])("%s stays on one line", (_name, scope, err) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError(scope, err);
    const line = String(spy.mock.calls[0][0]);
    expect([line.includes("\n"), line.includes("\r")]).toEqual([false, false]);
  });

  // 115 AC-2: only control characters are replaced; spaces stay.
  it.each([
    ["CR and LF", "a\r\nb", "amax a__b: Error"],
    ["a tab", "a\tb", "amax a_b: Error"],
    ["U+2028", `a${String.fromCharCode(0x2028)}b`, "amax a_b: Error"],
    ["U+2029", `a${String.fromCharCode(0x2029)}b`, "amax a_b: Error"],
    ["DEL", `a${String.fromCharCode(0x7f)}b`, "amax a_b: Error"],
    ["U+0085 (NEL)", `a${String.fromCharCode(0x85)}b`, "amax a_b: Error"],
    ["spaces kept", "ai.tool read_ticket", "amax ai.tool read_ticket: Error"],
  ])("%s", (_name, scope, start) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError(scope, new Error("x"));
    expect(String(spy.mock.calls[0][0]).startsWith(start)).toBe(true);
  });
  it("115 a control character in the error's name is replaced", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("chat", Object.assign(new Error("x"), { name: `Bad${String.fromCharCode(0x85)}Name` }));
    expect(String(spy.mock.calls[0][0])).toMatch(/^amax chat: Bad_Name \[/);
  });
  it("115 AC-1 a code keeps its spaces", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("chat", Object.assign(new Error("x"), { code: "400 invalid_request_error" }));
    expect(String(spy.mock.calls[0][0])).toMatch(/^amax chat: Error 400 invalid_request_error \[/);
  });
});
