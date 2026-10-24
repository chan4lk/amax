"use client";

import { useId, type FormEvent } from "react";
import { announce } from "@amax/ui";
import type { PendingAction } from "@amax/chat";
import { confirmSecretChat, type CardOutcome } from "../../app/actions/chat";

type State = { state: CardOutcome["state"] | "working"; note?: string };

// The confirm card's masked field (047 AC-4). The value lives only in this uncontrolled input; it is
// posted straight to the server action bound to this pending action and the field is cleared at
// once. It never enters React state, the chat log, the model's input or the conversation record.
export function SecretConfirm({ conversationId, as, action, onState, onCancel }: { conversationId: string; as?: string; action: PendingAction & { secret: { label: string } }; onState: (s: State) => void; onCancel: () => void }) {
  const id = useId();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    form.reset();
    onState({ state: "working" });
    try {
      const o = await confirmSecretChat(conversationId, action.id, data);
      onState(o);
      announce(o.note);
    } catch {
      onState({ state: "open", note: "That didn't go through. Type the value again." });
    }
  }
  return (
    <form className="secret" onSubmit={submit} autoComplete="off">
      {as && <input type="hidden" name="as" value={as} />}
      <label htmlFor={id} style={{ display: "grid", gap: 6, fontSize: 13.5, fontWeight: 600, marginTop: 10 }}>{action.secret.label}
        <input id={id} name="secret" type="password" required autoComplete="new-password" spellCheck={false} maxLength={16_384} className="select" style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1.5px solid var(--line-2)", background: "var(--card)", color: "inherit" }} />
      </label>
      <p className="muted" style={{ fontSize: 13, margin: "8px 0" }}>Typed here only. It goes straight to the vault, never to the AI or the chat history.</p>
      <div className="acts">
        <button className="btn sm primary" type="submit">Confirm</button>
        <button className="btn sm" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
