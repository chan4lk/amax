import { monthName, monthRange, type CardField, type CardForm } from "@amax/core";
import type { FieldCheck } from "@amax/chat";

export type Values = Record<string, string>;

const onForm = (form: CardForm, field?: string) => Boolean(field) && form.fields.some((f) => f.name === field);

export function refusalOf(form: CardForm, message?: string, field?: string): { check: FieldCheck; notice?: string } {
  if (!message) return { check: {} };
  return onForm(form, field) ? { check: { field, message } } : { check: {}, notice: message };
}

export function checkResultOf(result: FieldCheck): { check: FieldCheck; notice?: string; note?: string; verified: boolean } {
  if (result.transient) return { check: {}, notice: result.message, verified: false };
  if (result.message) return { check: result, verified: false };
  return { check: {}, verified: true, ...(result.note ? { note: result.note } : {}) };
}

export const generalOf = (form: CardForm, check: FieldCheck | null) => (check?.message && !onForm(form, check.field) ? check.message : undefined);

export const initialsOf = (text: string) => {
  const words = text.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  if (words.length > 1) return words.map((w) => w[0]).join("").slice(0, 10);
  const word = words[0] ?? "";
  return `${word.slice(0, 1)}${word.slice(1).replace(/[AEIOU]/g, "").slice(0, 2)}`;
};

export const startValues = (form: CardForm, input: Record<string, unknown>): Values =>
  Object.fromEntries(form.fields.map((f) => [f.name, String(input[f.name] ?? f.value ?? "")]));

export const startTyped = (form: CardForm, values: Values) => new Set(form.fields
  .filter((f) => f.kind === "text" && f.follow && values[f.name] && values[f.name] !== initialsOf(values[f.follow] ?? ""))
  .map((f) => f.name));

export function withValue(form: CardForm, values: Values, typed: Set<string>, name: string, value: string): Values {
  const next = { ...values, [name]: value };
  for (const f of form.fields) {
    if (f.kind === "text" && f.follow === name && !typed.has(f.name)) next[f.name] = initialsOf(value);
  }
  return next;
}

const fill = (label: string, values: Values) => label.replace(/\{(\w+)\}/g, (_, k: string) => values[k] || "…");

const shown = (form: CardForm, values: Values): Values => Object.fromEntries(Object.entries(values).map(([k, v]) => {
  const f = form.fields.find((x) => x.name === k);
  // 109: a range's end month named with its start, by the same rule as the server's card text; anything else as typed.
  if (f?.kind === "text" && f.rangeFrom) return [k, monthRange(f.rangeFrom, v) ?? `${monthName(f.rangeFrom) ?? f.rangeFrom}–${v || "…"}`];
  return [k, (f?.kind === "chips" && f.options.find((o) => o.value === v)?.short) || v];
}));

export function confirmLabel(form: CardForm, values: Values, fallback: string) {
  const c = form.confirm;
  if (!c) return fallback;
  return fill(c.unless && !values[c.unless.field]?.trim() ? c.unless.label : c.label, shown(form, values));
}

export const hintOf = (field: CardField, values: Values) => (field.kind === "text" && field.hint && values[field.name]?.trim() ? fill(field.hint, { ...values, value: values[field.name] }) : undefined);

export const edited = (form: CardForm, values: Values) => Object.fromEntries(form.fields.map((f) => [f.name, values[f.name]?.trim() ?? ""]));
