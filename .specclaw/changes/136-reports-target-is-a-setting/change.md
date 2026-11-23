# Reports: the utilisation target is a setting that every figure follows

**Change:** 136-reports-target-is-a-setting · **Created:** 2026-11-16

## Problem

The product owner needs to change the utilisation target (80%) and see all figures change with it. The tool and setting already exist (`set_utilisation_target`, an Admin write that goes through chat's confirm card, stored in `reports.settings`), and no calculation hard-codes 80. Nothing proved that the figures follow, so this change adds the proof and records how it works.

## Mock Delta

No screen changes. The "Change target" link on the ring card opens chat with "Change the utilisation target from 80% to "; after the confirm card the ring, the trend's target line, the bands, Needs attention, the People counts, the lede and the exported reports all use the new number.

## Acceptance Criteria

1. **AC-1** After `set_utilisation_target`, the report's `target` is the new number and the lede says "against a 70% target" or "below the 90% target" as the team figure falls.
2. **AC-2** Who counts as under target follows it: at 80% Ayesha Rahman (73%) is under target; at 70% nobody is; at 90% Ayesha Rahman and Kasun Dias are (Nimal, at 92%, is not). The exported report's findings follow the same.
3. **AC-3** Only an Admin may change it; other roles are refused.

## Tasks

- [x] `T1` — A test that the target change flows through the figures (AC-1, AC-2, AC-3)
  Files: modules/reports/tests/target.test.ts

## Verify

**Verdict:** PASS

- AC-1: pass — the new test sets the target to 70 and 90 and reads the lede back: "84%, against a 70% target", then "below the 90% target".
- AC-2: pass — the same test: at 80 only Ayesha Rahman is under target, at 70 nobody, at 90 Ayesha Rahman and Kasun Dias.
- AC-3: pass — a role without reports:admin (Nimal) is refused.

Reports tests: 29 of 29 pass. Not tried in a browser or with the real bot: the page takes the target from the same report data, so its ring, bands and counts follow it, but that was not clicked through. A Leadership, PM or Finance user can read Reports but cannot change the target.

