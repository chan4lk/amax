import type { PersonUtilisation, TeamUtilisation } from "../contracts";
import type { AvailabilityRow } from "./availability";
import type { Range } from "./days";
import type { Pulse } from "./pulse-types";
import type { Trend } from "./view";

export const KINDS = ["utilisation", "availability", "delivery"] as const;
export type ReportKind = (typeof KINDS)[number];

export type ExportScope = { project?: string; person?: string; people?: string[] };
export type ExportData = {
  title: string; period: string; madeFor: string; madeOn: string; target: number; briefing: string; trend: Trend; free: number | null; scope: string; kind: ReportKind;
  availability: AvailabilityRow[]; range: Range | null; window: string;
  rows: PersonUtilisation[]; team: TeamUtilisation; pulse: Pulse; month: string;
  plan: Plan | null;
};
export type Plan = { label: string; on: boolean; lines: { person: string; project: string; percent: number }[] };

export class ExportRefused extends Error {}
