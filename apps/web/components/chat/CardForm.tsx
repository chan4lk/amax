"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CardField, CardForm as Form } from "@amax/core";
import type { FieldCheck } from "@amax/chat";
import { FormChips } from "./FormChips";
import { generalOf, hintOf, type Values } from "./form-values";

type Props = {
  form: Form; values: Values; check: FieldCheck; verified: boolean; notice?: string; disabled: boolean;
  onValue: (name: string, value: string) => void;
};

function TextField({ field, values, error, ok, disabled, onValue }: { field: Extract<CardField, { kind: "text" }>; values: Values; error?: string; ok: boolean; disabled: boolean; onValue: Props["onValue"] }) {
  const id = useId();
  const hint = ok ? hintOf(field, values) : undefined;
  return (
    <div className="cf-field">
      <label htmlFor={id}>{field.label}</label>
      <input id={id} className={field.upper ? "cf-text up" : "cf-text"} value={values[field.name] ?? ""} disabled={disabled} aria-invalid={Boolean(error)}
        aria-describedby={`${id}-note`} onChange={(e) => onValue(field.name, field.upper ? e.target.value.toUpperCase() : e.target.value)} />
      <p id={`${id}-note`} className={error ? "err" : "cf-hint"} aria-live="polite">{error ?? hint ?? ""}</p>
    </div>
  );
}

function Field({ field, values, check, verified, disabled, onValue }: Omit<Props, "form"> & { field: CardField }) {
  const error = check.field === field.name ? check.message : undefined;
  if (field.kind === "chips") return <FormChips field={field} value={values[field.name] ?? ""} error={error} disabled={disabled} onChange={(v) => onValue(field.name, v)} />;
  return <TextField field={field} values={values} error={error} ok={verified} disabled={disabled} onValue={onValue} />;
}

export function CardForm({ form, values, check, verified, notice, disabled, onValue }: Props) {
  const optional = new Set(form.optional?.fields ?? []);
  const draw = (f: CardField) => <Field key={f.name} field={f} values={values} check={check} verified={verified} disabled={disabled} onValue={onValue} />;
  const [startOpen] = useState(() => form.fields.some((f) => optional.has(f.name) && f.kind === "text" && values[f.name]?.trim()));
  const section = useRef<HTMLDetailsElement>(null);
  const refusedInside = Boolean(check.message && check.field && optional.has(check.field));
  useEffect(() => { if (refusedInside && section.current) section.current.open = true; }, [refusedInside]);
  const message = generalOf(form, check) ?? notice;
  return (
    <div className="cf">
      {form.fields.filter((f) => !optional.has(f.name)).map(draw)}
      {form.optional && (
        <details className="cf-more" ref={section} open={startOpen || undefined}>
          <summary>{form.optional.label}</summary>
          {form.fields.filter((f) => optional.has(f.name)).map(draw)}
        </details>
      )}
      {message ? <p className="err" role="alert">{message}</p> : null}
    </div>
  );
}
