import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CardField, CardForm } from "@amax/core";
import { FormChecks } from "../components/chat/FormChecks";
import { edited } from "../components/chat/form-values";
import { openOf } from "../lib/chat-outcome";

type Checks = Extract<CardField, { kind: "checks" }>;
const proposals: Checks = { name: "proposalKeys", label: "Proposals", kind: "checks", options: [
  { value: "ORB-044", label: "ORB-044 Offline drafts" }, { value: "ORB-047", label: "ORB-047 Shared tags", detail: "in v0.13.1 · UAT · In progress" }] };
const move: Checks = { name: "reassign", label: "Move from their release", kind: "checks", of: "proposalKeys", options: [{ value: "ORB-047", label: "ORB-047 from v0.13.1" }] };
const draw = (field: Checks, values: Record<string, string>) => renderToStaticMarkup(createElement(FormChecks, { field, values, disabled: false, onChange: () => {} }));

describe("124 the checks field and the in-app link", () => {
  it("AC4 checkboxes in a fieldset with a legend; ticked values, details, an empty line; a dependent field shows only what is ticked", () => {
    const html = draw(proposals, { proposalKeys: "ORB-047" });
    expect(html).toMatch(/^<fieldset class="cf-checks"[^>]*><legend>Proposals<\/legend>/);
    const box = (v: string) => new RegExp(`<input(?=[^>]*type="checkbox")(?=[^>]*value="${v}")(?=[^>]*\\bchecked)[^>]*>`);
    expect(html).toMatch(box("ORB-047"));
    expect(html).not.toMatch(box("ORB-044"));
    expect(html).toContain("<small>in v0.13.1 · UAT · In progress</small>");
    expect(draw({ ...proposals, options: [], empty: "No Verified or Released proposals in ORB yet" }, {})).toContain("No Verified or Released proposals in ORB yet");
    expect(draw(move, { proposalKeys: "ORB-044" })).toBe("");
    expect(draw(move, { proposalKeys: "ORB-044,ORB-047" })).toContain('value="ORB-047"');
    const form: CardForm = { fields: [proposals, move] };
    expect(edited(form, { proposalKeys: "ORB-044", reassign: "ORB-047" })).toEqual({ proposalKeys: "ORB-044", reassign: "" });
    for (const stray of ["ORB-099", "orb-044", "FLT-001"]) {
      expect(edited(form, { proposalKeys: `ORB-044,${stray}`, reassign: "" }).proposalKeys).toBe(`ORB-044,${stray}`);
      expect(draw(proposals, { proposalKeys: stray })).toMatch(box(stray));
    }
  });

  it("AC8 the done card opens an in-app path, never another host", () => {
    expect(openOf({ open: { label: "Open the release", url: "/delivery/releases/ORB/v0.14.0" } })).toEqual({ label: "Open the release", url: "/delivery/releases/ORB/v0.14.0" });
    for (const url of ["//evil.example/x", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/ /evil.example", "/\u0000/evil.example"])
      expect(openOf({ open: { label: "x", url } }), JSON.stringify(url)).toBeUndefined();
    expect(openOf({ open: { label: "GitHub", url: "https://github.com/login" } })).toBeDefined();
  });
});
