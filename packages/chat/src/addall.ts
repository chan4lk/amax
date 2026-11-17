export const addAllNote = (states: string[], goal: "done" | "cancelled") => {
  const hit = states.filter((s) => s === goal).length;
  const word = goal === "done" ? "added" : "cancelled";
  const miss = states.length - hit;
  return miss ? `${hit} ${word}, ${miss} didn't go through. They are still above.` : `${hit} ${word}.`;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (m: unknown) => {
  const [y, n] = String(m).split("-");
  return MONTHS[Number(n) - 1] ? `${MONTHS[Number(n) - 1]} ${y}` : String(m);
};

export function summaryLine(input: Record<string, unknown>, title = "") {
  const { person, projectKey, work, month, through, percent, from } = input;
  if (person && (projectKey || work) && month && percent !== undefined) {
    return `${person} on ${projectKey ?? work}, ${monthName(month)}${through ? ` to ${monthName(through)}` : ""}: ${percent}%`;
  }
  if (from && !person) {
    const [y, n] = String(from).split("-").map(Number);
    const next = n === 12 ? `${y + 1}-01` : `${y}-${String(n + 1).padStart(2, "0")}`;
    return `Copy ${monthName(from)} into ${monthName(next)}${input.team ? `, ${input.team}` : ""}`;
  }
  return title || Object.values(input).filter((v) => v !== undefined && v !== "").join(", ");
}
