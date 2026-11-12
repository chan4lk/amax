# Follow-ups

Deferred by the review loop: minors and pre-existing findings.

- [minor B1] `apps/web/tests/e2e/delivery.spec.ts:94` The test checks only the first row for each project. The comment says all of AMX's released rows come from the repo's archive and say so (092). But a wrong 'Prod' chip on any AMX row after the first would still pass. The CON check is also only good while CON-009 is the fixtures' only CON release. Fix: read every 'Shipped to' cell in the filtered table, for example with allTextContents(). Then assert that each AMX row says 'Released · from repo' and each CON row says 'Prod'. (round 1) <!-- fp:c900390c5696 -->
