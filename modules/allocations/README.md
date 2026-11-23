# allocations (change 010)

Plan people across projects by month, and see over-allocation and the bench ahead.

- **Owner:** `/modules/allocations/` in `.github/CODEOWNERS`
- **Screens:** `/allocations` (capacity vs demand, bench by skill for the first forecast month, per-person monthly grid for the projects you manage), `/allocations/everyone`
- **Depends on:** `hr` (people, FTE and dates via `listPeople`, `getPerson`, `listEmploymentPeriods`) and `delivery` (projects via `listProjectRefs`, `getProjectRef`). **Integrates with (optional):** `leave` (012). It isn't installed yet, so capacity doesn't subtract booked leave (`leaveAdjusted: false`, said on screen).
- **Contracts** (`contracts.ts`, v2, unreleased: nothing builds against it yet; v1 reads took no reader and returned arrays): `listAllocations(tx, reader, opts)`, `personMonthTotals(tx, reader, opts)` (an hr `Reader`: a viewer gets the people their hr:read reaches, a system job everyone; both return `{ rows, hidden }`: with `personIds`, `hidden` counts every requested person the reader may not see, rows or not; without, the people with rows in range the reader may not see), `monthOf`, `EVENTS`, payload types
- **Events:** `allocations.allocation.set`, `allocations.month.copied`
- **Data scope:** capacity, demand and bench are team aggregates and count every member; the grid shows only people the viewer's hr access reaches and says how many it hides. Allocating or copying without a viewer is refused unless core issued the context for a job (`isSystemContext`); one call writes at most 24 months.
- **Rules:** capacity = the team's FTE on the 15th of each month (hr employment periods); demand = allocated percent / 100 plus unstaffed forecast demand; bench = members employed that month with nothing allocated; a person is over-allocated when their total is above their FTE. Months after the current quarter are a forecast.
- **MCP tools** (`mcp.ts`): read `get_capacity_forecast`, `list_allocations`; write `allocate`, `copy_allocations_to_next_month`
- **Chat intents** (`chat.ts`): Allocate (`allocations.allocate`)
- **Add someone (107):** the project's Team page leads with its PM and an Ask amax button. `allocate` answers with a form
  card (likely people not on the project this month, most free first; a percent; This month or Until further notice,
  100% until further notice on an internal project). Someone who can sign in but has no HR record is named, to be added
  to HR first (`add_person`, whose receipt offers the project next). **Until further notice** (`standing: true`) is an
  `allocations.standing` row whose month rows are written 12 months ahead, so every reader counts it; the monthly
  `allocations.standing-extend` schedule writes the next month, never over one set by hand; `percent: 0` with
  `standing: true` ends it from that month.
- **Permissions:** `allocations:read` (Leadership, HR, PM); `allocations:allocate@managed` and `allocations:copy` (PM; Copy to next month only copies rows on projects the viewer may allocate, and reports rows already planned (`skipped`) apart from rows it may not copy (`forbidden`))
- **Viewer scopes:** contributes the projects a user is allocated to this month (`assignedProjects`)
- **Data:** `allocations.member` (team, skill), `allocation` (person, project or other work, month, percent), `forecast` (unstaffed demand), all RLS on `tenant_id`. No personal fields of its own: people are hr ids.
- **Fixtures:** the delivery team (Engineering, Quality and seven delivery staff), Nimal, Kasun and Ayesha as in the mock, and generic allocations that reproduce fixtures.md: capacity 140..144, demand 138..141 (Oct to Mar), 6 on the bench in January
- **Tests:** `pnpm --filter @amax/allocations test` (DB tests need `DATABASE_MIGRATE_URL`)
