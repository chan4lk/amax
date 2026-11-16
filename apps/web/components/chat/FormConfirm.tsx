"use client";

import { useRef, useState } from "react";
import type { CardForm as Form } from "@amax/core";
import type { Edits, FieldCheck } from "@amax/chat";
import { CHECK_FAILED } from "@amax/chat/field-check";
import { CardForm } from "./CardForm";
import { checkResultOf, confirmLabel, edited, refusalOf, startTyped, startValues, withValue, type Values } from "./form-values";

type Props = {
  form: Form; input: Record<string, unknown>; fallback: string; busy: boolean; note?: string; field?: string;
  onConfirm: (edits: Edits) => void; onEdit: () => void; onCancel: () => void; onCheck: (edits: Edits) => Promise<FieldCheck>;
};
const CHECK_MS = 8000;
const timed = (p: Promise<FieldCheck>) => Promise.race([p, new Promise<FieldCheck>((ok) => setTimeout(() => ok(CHECK_FAILED), CHECK_MS))]).catch(() => CHECK_FAILED);

export function FormConfirm({ form, input, fallback, busy, note, field, onConfirm, onEdit, onCancel, onCheck }: Props) {
  const [values, setValues] = useState<Values>(() => startValues(form, input));
  const [check, setCheck] = useState<FieldCheck>(() => refusalOf(form, note, field).check);
  const [notice, setNotice] = useState(() => refusalOf(form, note, field).notice);
  const [verified, setVerified] = useState(false);
  const [info, setInfo] = useState<string | undefined>(form.note);
  const [shown, setShown] = useState(note);
  const [checking, setChecking] = useState(false);
  const typed = useRef<Set<string> | null>(null);
  typed.current ??= startTyped(form, values);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asked = useRef(0);
  if (note !== shown) {
    setShown(note);
    const r = refusalOf(form, note, field);
    if (note) { setCheck(r.check); setNotice(r.notice); setVerified(false); }
  }

  function ask(next: Values) {
    if (timer.current) clearTimeout(timer.current);
    const n = ++asked.current;
    setChecking(true);
    setVerified(false);
    timer.current = setTimeout(async () => {
      const r = checkResultOf(await timed(onCheck(edited(form, next))));
      if (n === asked.current) { setCheck(r.check); setNotice(r.notice); setInfo(r.note); setVerified(r.verified); setChecking(false); }
    }, 350);
  }

  function onValue(name: string, value: string) {
    typed.current!.add(name);
    const next = withValue(form, values, typed.current!, name, value);
    setValues(next);
    setNotice(undefined);
    ask(next);
  }

  const blocked = busy || checking || Boolean(check.message);
  return (
    <>
      <CardForm form={form} values={values} check={check} verified={verified} notice={notice} disabled={busy} onValue={onValue} />
      {info && !checking && <p className="cc-help" aria-live="polite">{info}</p>}
      {busy ? <p className="muted">Working on it…</p> : (
        <div className="cc-acts">
          <button className="btn sm primary" type="button" disabled={blocked} onClick={() => onConfirm(edited(form, values))}>{confirmLabel(form, values, fallback)}</button>
          <button className="cc-quiet" type="button" onClick={onEdit}>Edit</button>
          <button className="cc-quiet" type="button" onClick={onCancel}>Cancel</button>
        </div>
      )}
    </>
  );
}
