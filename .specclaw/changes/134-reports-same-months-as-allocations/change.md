# Reports: Coming up lists the same months, and so the same people, as Allocations

**Change:** 134-reports-same-months-as-allocations · **Created:** 2026-11-16

## Problem

Coming up listed three over-allocated people while the Allocations tab listed two. Reports started its months at its own month (October, because Reports' date is October 16) and listed only the first three, while the Allocations tab starts at the current calendar month (November) and shows six. So the same plan gave different answers on the two tabs: Coming up had Ayesha (October), Nimal (October) and Ayesha (November); Allocations had Ayesha (November) and Kasun (February).

## Mock Delta

No new screen. Coming up's over-allocated and bench items follow the six months the Allocations tab shows. See [`134-reports-same-months-as-allocations`](../../mock/index.html#134-reports-same-months-as-allocations).

## Acceptance Criteria

1. **AC-1** Reports asks Allocations for its own month window (six months from the current month) and uses it for the capacity, over-allocated and bench figures, so the two tabs list the same months.
2. **AC-2** Coming up lists every month of that window that has someone over 100% or on the bench, not only the first three.
3. **AC-3** A month where nothing is planned for anyone yet lists no bench, instead of everyone as "on the bench".
4. **AC-4** The words "next three months" in the report file, the page and the suggested question say "six months".

## Tasks

- [x] `T1` — Reports uses the Allocations month window (AC-1, AC-2, AC-3, AC-4)
  Files: modules/allocations/contracts.ts, modules/reports/server/pulse-allocation.ts, server/sections-plan.ts, ui/ComingUp.tsx, ui/Stats.tsx, chat-suggestions.ts, tests/pulse.test.ts

## Verify

**Verdict:** PASS

- AC-1: pass — Reports now calls Allocations' `windowMonths` and the pulse test checks its capacity and allocation months equal `windowMonths(now, 6)`: November to April.
- AC-2, AC-3: pass — on the real database Coming up (Your people and Everyone) now lists Ayesha Rahman 110% in November and Kasun Dias 110% in February, the same two the Allocations tab lists as over capacity; the empty April no longer says "144 on the bench".
- AC-4: pass — the wording is changed in the report section, the page text, Stats and the suggested question.

Type-check clean. Reports tests: 27 of 27 pass. Allocations tests: the same 3 old failures, the rest pass. Consequence to know: October, the month Reports itself is on (its date is October 16, behind the calendar), is no longer in Coming up, so Nimal's 120% in October shows only in the availability figures. The two screens still run on two different "today"s; this change only makes them list the same months. Browser not looked at.

