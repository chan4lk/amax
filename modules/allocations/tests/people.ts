import type { Known } from "../server/attention";
import type { Forecast, MonthPoint } from "../server/forecast";
import type { Grid, GridPerson } from "../server/grid";

export const months = ["2026-12-01", "2027-01-01", "2027-02-01"];

const line = (label: string, key: string, percents: number[], manages = false) => ({ projectId: key, projectKey: key, label, manages, editable: true, percents, standing: false });

export const person = (id: string, name: string, totals: number[], lines = [line("Contoso Portal", "CON", totals)]): GridPerson =>
  ({ personId: id, employeeNo: id, name, initials: name.slice(0, 2), title: "Engineer", lines, totals, capacity: [100, 100, 100] });

export const grid: Grid = {
  months: months.map((month) => ({ month, forecast: false })), scope: "everyone", hidden: 0,
  people: [person("a", "Ayesha Rahman", [120, 100, 100], [line("Contoso Portal", "CON", [70, 60, 60]), line("HR Insights", "HRI", [50, 40, 40])]), person("n", "Nimal Silva", [100, 100, 100]), person("k", "Kasun Dias", [100, 0, 0])],
};

export const point = (month: string, benchIds: string[], capacity = 100, demand = 90): MonthPoint =>
  ({ month, forecast: true, capacity, demand, bench: benchIds.map((personId) => ({ personId, skill: ".NET" })) });

export const points = [point(months[0], ["k"]), point(months[1], ["k", "z"]), point(months[2], ["k", "z"])];

export const known = new Map<string, Known>([
  ["k", { employeeNo: "k", name: "Kasun Dias", initials: "KD" }],
  ["z", { employeeNo: "z", name: "Zed Nobody", initials: "ZN" }],
]);

export const forecast: Forecast = {
  team: "Delivery team", teams: ["Delivery team"], leaveAdjusted: false,
  months: [{ month: months[0], forecast: false, capacity: 140, demand: 138, bench: [] }, { month: months[1], forecast: true, capacity: 141, demand: 143, bench: [] }, { month: months[2], forecast: true, capacity: 142, demand: 136, bench: [] }],
};
