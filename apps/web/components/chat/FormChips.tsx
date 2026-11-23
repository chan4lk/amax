"use client";

import { useId, useState } from "react";
import type { CardField } from "@amax/core";

type Chips = Extract<CardField, { kind: "chips" }>;
type Props = { field: Chips; value: string; error?: string; disabled: boolean; onChange: (value: string) => void };

export function FormChips({ field, value, error, disabled, onChange }: Props) {
  const id = useId();
  const listed = field.options.some((o) => o.value === value);
  const [otherOn, setOtherOn] = useState(Boolean(field.other) && !listed && value !== "");
  const other = Boolean(field.other) && otherOn;
  const pick = (v: string) => { setOtherOn(false); onChange(v); };
  return (
    <fieldset className="cf-chips" aria-describedby={error ? `${id}-err` : undefined} disabled={disabled}>
      <legend>{field.label}</legend>
      {field.options.map((o) => (
        <label key={o.value} className={!other && o.value === value ? "chip on" : "chip"}>
          <input type="radio" name={id} value={o.value} checked={!other && o.value === value} onChange={() => pick(o.value)} />{o.label}
        </label>
      ))}
      {field.other && (
        <label className={other ? "chip on" : "chip"}>
          <input type="radio" name={id} value="" checked={other} onChange={() => { setOtherOn(true); onChange(""); }} />{field.other}
        </label>
      )}
      {other && <input className="cf-text" aria-label={`${field.label}: ${field.other}`} value={value} onChange={(e) => onChange(e.target.value)} />}
      {error && <p className="err" id={`${id}-err`}>{error}</p>}
    </fieldset>
  );
}
