// 070 AC-57: how long ago something happened, to the minute, so a waiting request shows how long it has waited.
export function ago(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min ago` : `${h} h ago`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h ago` : `${d} d ago`;
}
