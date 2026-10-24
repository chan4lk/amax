import type { TeamUtilisation } from "../contracts";

export const hoursText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

type Lede = { name: string; span: string; workingDays: number; perPerson: number; team: TeamUtilisation; target: number; toDate: boolean };

/** What the screen leads with: the team's utilisation for the period against the target. */
export function ledeOf({ name, span, workingDays, perPerson, team, target, toDate }: Lede) {
  const when = toDate ? `${name} to date` : `in ${name}`;
  // 072 AC-6: the lede says which hours count (D1: submitted and approved weeks).
  const period = `Billable hours from submitted and approved time ÷ available hours, ${when} (${span}, ${workingDays} working days, ${perPerson} h per full-time person).`;
  if (team.utilisation === null) return `${period} No logged hours you can see yet.`;
  const vs = team.utilisation >= target ? `against ${/^(8|11|18)/.test(String(target)) ? "an" : "a"} ${target}% target` : `below the ${target}% target`;
  return `${period} Team: ${hoursText(team.billableHours)} ÷ ${hoursText(team.availableHours)} = ${team.utilisation}%, ${vs}.`;
}
