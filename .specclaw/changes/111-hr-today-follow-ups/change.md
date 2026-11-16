# HR today follow-ups: one date engine, the README, a dead re-export, and a test that won't drift

**Change:** 111-hr-today-follow-ups · **Created:** 2026-11-16 · **Review:** change

**Builds on:** 110-hr-one-today (its four minors from the final pass, in its `follow-ups.md`, round 4).

## Problem

110 passed clean with four minors open. HR works out an entity's today two ways: `entityToday` in Node (Intl) for
change_person and add_person, `entityDay` in Postgres for the in-force reads, on two tz databases that could disagree.
`services.ts` re-exports two helpers nobody imports from it. The HR README still says reads default to "today" and
doesn't say the status job fails naming entities with no zone. And 110's confirm test allocates 2027–2028 months
against the real clock, so it will break as those months pass, the date drift CI already suffers.

## Mock Delta

What changes on screen, and where to see it: [`111-hr-today-follow-ups`](../../mock/index.html#111-hr-today-follow-ups)

No screen change: the mock section says so.

## Acceptance Criteria

1. **AC-1** `entityToday` gives the date Postgres works out for the entity (`entityDay`), still refusing an entity with
   no zone: one date engine for HR's writes and reads. At 20:00 UTC on 15 Nov, Sri Lanka and Sydney get 2026-11-16 from
   both.
2. **AC-2** `services.ts` no longer re-exports `entityToday` and `noZone`; their one home is `zones.ts`.
3. **AC-3** The HR README says HR's reads default to each person's own today in their entity's time zone (UTC for an
   entity with none), names `get_legal_entity`, and says the hourly `hr.person.status` job fails naming entities with no
   zone once the others are moved.
4. **AC-4** The add-card confirm test fakes its clock, so its months stay in the future whatever the real date.

## Tasks

<!-- Added by plan, UI first, then backend, then integration, in tasks.md's task-line
     format: checkbox, `Tn`, em dash, title; then indented Files: and optional Depends: lines. -->

- [x] `T1` — One date engine and the loose ends: `entityToday` reads the entity's date from Postgres (`entityDay`), still
  refusing an entity with no zone; `services.ts` drops its re-export; the HR README's reads, tools and Jobs lines; the
  add-card confirm test on a fake clock (AC-1–AC-4)
  Files: modules/hr/server/zones.ts, modules/hr/server/services.ts, modules/hr/README.md,
  modules/hr/tests/hr-today-110.test.ts, apps/web/tests/add-card-confirm-110.test.ts

## Verify

<!-- Filled by verify: a **Verdict:** PASS|FAIL line, then one `- AC-n: pass|fail — evidence`
     line per criterion, quality before → after, preset check, and screenshot paths
     (or "compared by eye: <who>"). -->

**Verdict:** PASS — every AC passes below; the review is clean at its first, final pass (`bb604729`).

- AC-1: pass — `modules/hr/server/zones.ts` takes the date from `entityDay` (Postgres), no Intl; `hr-today-110.test.ts`
  "111 AC1" table (Sri Lanka and Sydney at 20:00 UTC: entityToday and entityDay both 2026-11-16); the AC1 refusal of an
  entity with no zone still passes.
- AC-2: pass — `services.ts` has no re-export; HR type-checks with `zones.ts` the one home.
- AC-3: pass — `modules/hr/README.md`: contracts' default date, `get_legal_entity`, the hourly job's failure, HR writes'
  today.
- AC-4: pass — `apps/web/tests/add-card-confirm-110.test.ts` runs on a clock fixed at 2026-11-16 (3 of 3 pass).

Commands: hr (95) and the add-card confirm test (3) pass; `tsc --noEmit` exit 0 for hr and web. `specclaw-verify size`:
22 production lines against 110's head (`aa3071e0`), cap 400, exit 0. No screen change: screenshot `shots/mock.png` (the
mock section says so).

Quality: not_run (specclaw-quality-scan: jq "Argument list too long" on this Windows host)

Review: CLEAN — 1 round, final pass bb60472984, models opus/opus; last round 0/0/2 b/M/m. Minors in `follow-ups.md`:
entityToday reads the zone twice (a zone removed between the two reads would give UTC's date); the 111 AC1 test also
passes on the old Intl path, so it shows the engines agree rather than that one is gone.
