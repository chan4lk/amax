import type { ScreenProps } from "@amax/core";
import { canEver, type Viewer } from "@amax/auth";
import { Card, EmptyState } from "@amax/ui";
import { attention, matching, shown } from "../server/attention";
import { knownBench } from "../server/bench";
import { forecastFor } from "../server/forecast";
import { gridFor, type Grid } from "../server/grid";
import { showLine, showOf } from "../server/show";
import { AllocationsView } from "./AllocationsView";
import { benchMonths } from "./benchData";
import { PeopleBody } from "./PeopleBody";
import type { Group } from "./types";
import "./allocations.css";

const both = <T,>(make: (g: Group) => T): Record<Group, T> => ({ mine: make("mine"), all: make("all") });

export async function AllocationsPage({ params, searchParams = {}, viewer: raw }: ScreenProps) {
  const viewer = raw as Viewer | null;
  if (!viewer) return <><h1>Allocations and forecast</h1><Card><EmptyState icon="people" title="Sign in to see allocations" hint="Capacity, demand and the monthly plan come from the database once you're signed in." /></Card></>;
  const show = showOf({ ...searchParams, view: params.view ?? searchParams.view });
  const [f, mine, all] = await Promise.all([forecastFor(viewer), gridFor(viewer, { everyone: false }), gridFor(viewer, { everyone: true })]);
  const known = await knownBench(viewer, f.months);
  const grids = { mine, all };
  const pick = (grid: Grid) => {
    const found = matching(grid.people, show.q);
    return { found, people: shown(found, attention(grid, f.months, known), show.filter ?? "all") };
  };
  const picked = { mine: pick(mine), all: pick(all) };
  const empty = both((g) => picked[g].people.length ? null : <PeopleBody key={g} grid={grids[g]} found={picked[g].found} people={picked[g].people} show={show} />);
  const wanted = f.months.findIndex((m) => m.month === show.bench);
  const fallback = f.months.findIndex((m) => m.forecast);
  const data = {
    f, grids, start: show.everyone ? "all" as const : "mine" as const, line: showLine(show), canAllocate: canEver(viewer, "allocations:allocate"),
    bench: benchMonths(f, known), benchStart: wanted >= 0 ? wanted : fallback >= 0 ? fallback : f.months.length - 1,
  };
  const visible = { mine: picked.mine.people.map((p) => p.personId), all: picked.all.people.map((p) => p.personId) };
  return <AllocationsView key={data.start} data={data} empty={empty} visible={visible} />;
}

export const AllocationsEveryonePage = (props: ScreenProps) => AllocationsPage({ ...props, params: { ...props.params, view: "everyone" } });
