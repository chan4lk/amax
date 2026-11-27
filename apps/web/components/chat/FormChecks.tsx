"use client";

import { useId } from "react";
import type { CardField } from "@amax/core";
import { shownChecks, ticked, type Values } from "./form-values";

type Checks = Extract<CardField, { kind: "checks" }>;
type Props = { field: Checks; values: Values; error?: string; disabled: boolean; onChange: (value: string) => void };

export function FormChecks({ field, values, error, disabled, onChange }: Props) {
  const id = useId();
  const options = shownChecks(field, values);
  if (field.of && options.length === 0) return null;
  const on = ticked(values[field.name]);
  const toggle = (v: string) => onChange(options.map((o) => o.value).filter((x) => (x === v ? !on.includes(v) : on.includes(x))).join(","));
  return (
    <fieldset className="cf-checks" aria-describedby={error ? `${id}-err` : undefined} disabled={disabled}>
      <legend>{field.label}</legend>
      {options.length === 0 && <p className="cf-hint">{field.empty ?? "Nothing to pick"}</p>}
      {options.map((o) => (
        <label key={o.value} className="cf-check">
          <input type="checkbox" value={o.value} checked={on.includes(o.value)} onChange={() => toggle(o.value)} />
          <span>{o.label}{o.detail && <small>{o.detail}</small>}</span>
        </label>
      ))}
      {error && <p className="err" id={`${id}-err`}>{error}</p>}
    </fieldset>
  );
}
