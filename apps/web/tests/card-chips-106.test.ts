import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CardField } from "@amax/core";
import { FormChips } from "../components/chat/FormChips";

const field: Extract<CardField, { kind: "chips" }> = { name: "client", label: "Client", kind: "chips", options: [{ value: "Contoso", label: "Contoso" }], other: "+ new…" };
const draw = (value: string) => renderToStaticMarkup(createElement(FormChips, { field, value, disabled: false, onChange: () => {} }));
const shown = (html: string) => html.match(/<input class="cf-text"[^>]*value="([^"]*)"/)?.[1];

describe("106 review round 2: the + new… field shows what was typed", () => {
  it.each([
    ["a space just typed after a word", "Northwind ", "Northwind "],
    ["two words mid-typing", "Northwind Traders ", "Northwind Traders "],
    ["a double space", "Acme  Co", "Acme  Co"],
    ["a leading space", " Lead", " Lead"],
  ])("B2 %s stays in the field as typed", (_name, value, expected) => {
    expect(shown(draw(value))).toBe(expected);
  });

  it("B2 a value that is a listed option picks that chip and draws no text field", () => {
    const html = draw("Contoso");
    expect(shown(html)).toBeUndefined();
    expect(html).toContain('<label class="chip on">');
    expect(html).toMatch(/<input(?=[^>]*\bchecked)(?=[^>]*value="Contoso")[^>]*>/);
  });
});
