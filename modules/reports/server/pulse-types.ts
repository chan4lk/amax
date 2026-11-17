export type PulseState = "ok" | "empty" | "off";
export type PulseCard = "briefing" | "utilisation" | "capacity" | "allocation" | "hours" | "away";

export type CapacityMonth = { month: string; label: string; capacity: number; demand: number; over: number };
export type AllocationMonth = { month: string; label: string; over: { name: string; percent: number }[]; bench: number; skills: string };
export type HoursRow = { projectId: string; name: string; planned: number; logged: number; drift: number | null; flag: "behind" | "over" | null };
export type AwayRow = { name: string; initials: string; startsOn: string; endsOn: string; type: string; half: "am" | "pm" | null };

export type Pulse = {
  month: string;
  monthName: string;
  target: number;
  utilisation: number | null;
  billableHours: number;
  availableHours: number;
  briefing: string;
  capacity: { state: PulseState; months: CapacityMonth[] };
  allocation: { state: PulseState; months: AllocationMonth[] };
  hours: { state: PulseState; limit: number; rows: HoursRow[] };
  away: { state: PulseState; rows: AwayRow[] };
};
