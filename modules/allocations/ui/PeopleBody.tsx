import { EmptyState } from "@amax/ui";
import type { Grid as GridData, GridPerson } from "../server/grid";
import type { Show } from "../server/show";

type Props = { grid: GridData; found: GridPerson[]; people: GridPerson[]; show: Show };

export function PeopleBody({ grid, found, people, show }: Props) {
  if (grid.scope === "none") return <EmptyState icon="people" title="You don't manage any projects" hint="My projects shows the people on projects you manage. Use Everyone above, or ask amax." />;
  if (people.length) return null;
  if (show.q && !found.length) return <EmptyState icon="people" title={`No one matches "${show.q}"`} hint="Ask amax to show everyone again." />;
  if (grid.people.length) return <EmptyState icon="people" title="No one matches this filter" hint="Ask amax to show everyone again." />;
  if (grid.hidden) return <EmptyState icon="people" title="No one you can see here" hint={`${grid.hidden} ${grid.hidden === 1 ? "person is" : "people are"} outside your HR access.`} />;
  return <EmptyState icon="people" title="No allocations yet" hint="Use Allocate to plan people onto projects by month." />;
}
