# hr (change 011)

People records: directory, person page, employment history, documents and probation. Leave, payroll, access and allocations read people through `contracts.ts`.

- **Owner:** `/modules/hr/` in `.github/CODEOWNERS`
- **Screens:** `/hr` (People: stats, departments, joiners and leavers, directory), `/hr/all`, `/hr/e/:entity[/all]` (one entity by country code, e.g. `lk`, `au`, or by id when two entities share a country; an unknown code is a 404), `/hr/p/:employeeNo` (Person)
- **Contracts** (`contracts.ts`, v2; v1 reads took no reader and are gone, no module had shipped against them): every read takes a `Reader` (a viewer, or a `ServiceContext`) and an as-of date (default: each person's own today in their legal entity's time zone, 110; UTC's for an entity with none, and a read never refuses). A viewer sees the legal entities and departments their `hr:read` reaches, plus themself; a system job (a context core issued with `contextFor.job`, checked by `isSystemContext`, never a hand-built `kind: "system"` literal) sees everyone, and its unmasked pay reads are audited (`hr.employment.read`); any other context without a viewer is refused. `getPerson(tx, reader, idOrEmployeeNo, on?)`, `listPeople(tx, reader, scope)`, `getEmployment(tx, personId, reader, on?)` (pay and bank masked per 002 for a viewer; `contractEndsOn` is the last period's end), `listEmploymentPeriods(tx, reader, personIds?)` (FTE and dates, no pay), `reportUserIds(tx, userId, on?)`, `EVENTS`, `EMPLOYMENT_SENSITIVE`, payload types
- **Jobs:** `hr.person.status` (hourly, at :05) moves joiners to active and leavers to left as their dates pass, each by their entity's own today; once those are moved it fails, naming any entity with no time zone, whose people it left as they were (110)
- **Effective dating:** a job change from a date also updates periods that already start later where they still hold the old value (a planned step or raise stays); title, location and work email change today only. "Today" for HR's writes is the person's entity's own (add_person, change_person, record_leaver), and an entity with no time zone is refused (109, 110). A leaver's later periods are removed and listed in the audit record (pay values left out).
- **Events:** `hr.person.joined`, `hr.person.left`, `hr.person.changed` (field names only, never values)
- **Classified fields:** `hr.employment.base_salary` and `epf_number` are `pay`; `bank_name` and `bank_account` are `bank`; each `hr.document` row has its own class (a medical certificate is `health`)
- **MCP tools** (`mcp.ts`): read `list_people`, `get_person`, `people_stats`, `get_legal_entity` (an entity and its time zone, for the People screen's no-zone line); write `add_person`, `change_person`, `record_leaver`
- **Chat intents** (`chat.ts`): Add person (`hr.add-person`)
- **Permissions:** `hr:read` (Leadership, PM, Payroll, HR), `hr:person:create|update|leave` (HR, scoped by legal entity; without a viewer only system jobs may write)
- **Viewer scopes:** contributes each user's reports, so manager-visible classes (performance) work
- **Data:** `hr.person`, `employment`, `document`, `probation` (all RLS on `tenant_id`); retention entries in `module.ts`
- **Fixtures:** the 184 Lumen Labs people of fixtures.md (named people plus generated ones), joiners and leavers per month, 11 on probation, 7 documents missing, 2 fixed-term contracts ending in November, 6 part-timers going full time (Dec, Feb, Mar) for allocations capacity
- **Optional integrations:** none yet. The Person page shows a leave-balance placeholder until 012 Leave lands.
- **Tests:** `pnpm --filter @amax/hr test` (DB tests need `DATABASE_MIGRATE_URL`)
