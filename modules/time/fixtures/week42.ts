export type Day = [day: number, project: string, hours: number];
export type Sheet = { key: string; agent: string; agentHours: number; status: "draft" | "submitted"; note?: string; days: Day[] };

export const WEEK = { year: 2026, week: 42 };

export const SHEETS: Sheet[] = [
  { key: "nimal", agent: "Claude for Nimal", agentHours: 22.4, status: "submitted",
    days: [[0, "CON", 8], [1, "CON", 7.5], [1, "FLT", 1], [2, "FLT", 7], [3, "FLT", 8]] },
  { key: "kasun", agent: "specclaw", agentHours: 25.4, status: "submitted",
    days: [[0, "CON", 8], [1, "CON", 8], [2, "CON", 8], [3, "FLT", 7.5], [4, "FLT", 1]] },
  { key: "ayesha", agent: "specclaw", agentHours: 10.3, status: "submitted", note: "Casual leave Fri",
    days: [[0, "HRI", 7.5], [1, "HRI", 8], [3, "CON", 8]] },
  { key: "tharushi", agent: "Claude for Tharushi", agentHours: 19.1, status: "draft",
    days: [[0, "FLT", 7], [1, "FLT", 8], [2, "FLT", 8], [3, "CON", 6]] },
  { key: "dinesh", agent: "specclaw", agentHours: 13.0, status: "draft", note: "Joined Oct 5",
    days: [[0, "CON", 7.6], [1, "CON", 6.9], [1, "HRI", 0.7], [2, "HRI", 5.8], [2, "FLT", 1.8], [3, "FLT", 2.2]] },
];

/** 081: whose Contoso hours went to which proposal (their own, as owner in Delivery's fixtures), so approving their week shows on it. */
export const PROPOSAL_OF: Record<string, Record<string, string>> = { nimal: { CON: "CON-014" }, kasun: { CON: "CON-011" }, ayesha: { CON: "CON-012" } };

const tenths = (h: number) => Math.round(h * 10);

export function splitByAgent(sheet: Sheet) {
  const total = sheet.days.reduce((s, [, , h]) => s + tenths(h), 0);
  let left = tenths(sheet.agentHours);
  return sheet.days.map(([day, project, hours], i) => {
    const agent = i === sheet.days.length - 1 ? left : Math.min(left, Math.round((tenths(hours) * tenths(sheet.agentHours)) / total));
    left -= agent;
    return { day, project, agent: agent / 10, person: (tenths(hours) - agent) / 10 };
  });
}
