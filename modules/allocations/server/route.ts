export function viewFor(text: string, mine: string[], all: string[], everyone: boolean) {
  const needle = text.trim().toLowerCase();
  const starts = (names: string[]) => names.some((name) => name.toLowerCase().startsWith(needle));
  if (!needle) return everyone;
  if (starts(mine)) return false;
  return starts(all) ? true : everyone;
}
