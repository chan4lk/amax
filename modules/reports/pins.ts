import type { PinnedRecord } from "@amax/core";
import type { PinRef } from "@amax/ui";

type PersonLike = { userId: string; name: string };

export const personLabel = (p: PersonLike, monthName: string) => `${p.name}, utilisation in ${monthName}`;
export const personPin = (p: PersonLike, month: string, monthName: string): PinRef => ({ label: personLabel(p, monthName), tool: "get_person_utilisation", args: { userId: p.userId, month } });
export const reportPin = (label: string, month: string, group?: string): PinRef => ({ label, tool: "get_utilisation", args: group ? { month, group } : { month } });

export const personOf = (r: (PersonLike & { monthName: string }) | null): PinnedRecord | null => (r ? { id: r.userId, label: personLabel(r, r.monthName) } : null);

export const pulsePin = (label: string, card: string, key?: string): PinRef => ({ label, tool: "get_delivery_pulse", args: key ? { card, key } : { card } });
