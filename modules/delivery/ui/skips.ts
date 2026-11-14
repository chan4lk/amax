// 091 AC-5: a push's skip lines ("AMX-001: released comes from Prod deployments") grouped by reason, so a first push
// that skips dozens for one reason reads as one line: "<reason> (n): KEY, KEY, …", five keys and then "+n more".
const SHOWN = 5;

export function groupSkips(lines: string[]): string[] {
  const byReason = new Map<string, string[]>();
  for (const line of lines) {
    const at = line.indexOf(": ");
    const [key, reason] = at < 0 ? ["", line] : [line.slice(0, at), line.slice(at + 2)];
    byReason.set(reason, [...(byReason.get(reason) ?? []), key].filter(Boolean));
  }
  return [...byReason].map(([reason, keys]) => {
    if (!keys.length) return reason;
    const more = keys.length > SHOWN ? `, +${keys.length - SHOWN} more` : "";
    return `${reason} (${keys.length}): ${keys.slice(0, SHOWN).join(", ")}${more}`;
  });
}
