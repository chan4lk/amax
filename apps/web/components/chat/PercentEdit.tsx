"use client";

import { useState } from "react";

type Props = { value: number; onSave: (percent: number) => Promise<void>; onBack: () => void };

export function PercentEdit({ value, onSave, onBack }: Props) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); await onSave(Number(draft)); setSaving(false); };
  return (
    <form className="acts" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label className="muted">Percent <input type="number" min={0} max={200} step={1} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Percent" style={{ width: 72 }} autoFocus /></label>
      <button className="btn sm primary" type="submit" disabled={saving || draft === ""}>Update</button>
      <button className="btn sm" type="button" disabled={saving} onClick={onBack}>Back</button>
    </form>
  );
}
