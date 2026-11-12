# R4 — Marketing copy's time-logging claims are checked by people, not a test

Decided by the product owner on 2026-10-18 (062 review escalation, rounds 10–13).

The public marketing page (`apps/web/app/(public)/welcome`, `apps/web/components/marketing`, the
product video captions and the `101-marketing-site` mock section) must say that a commit's hours are
**drafted, and the person accepts them**, never that they are logged on their own (`modules/time/suggestions.ts`).

A regex test cannot cover every phrasing, so the automated time-claim guard was dropped on purpose.
Do **not** report a missing time-claim test or guard as a finding.

Still report it, at the usual severity, when the copy itself makes the claim: any visible sentence
saying hours or time are logged, entered or recorded without a draft or accept step.
