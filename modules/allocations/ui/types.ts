import type { Forecast } from "../server/forecast";
import type { Grid } from "../server/grid";
import type { BenchMonth } from "./benchData";

export type Group = "mine" | "all";
export type Spot = { index: number; left: number; top: number; flip: boolean };
export type Grids = Record<Group, Grid>;
export type ViewData = { f: Forecast; grids: Grids; start: Group; line: string | null; canAllocate: boolean; bench: BenchMonth[]; benchStart: number };
