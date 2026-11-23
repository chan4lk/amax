# Reports: Leadership and PM may change the utilisation target

**Change:** 137-reports-pm-sets-target · **Created:** 2026-11-16
**Review:** covered-by 124-preset-clean-up

## Problem

Asked "Change the utilisation target from 80% to 60%", the bot answered that it has no tool for it and that nothing in settings covers it. The tool exists (`set_utilisation_target`) but needed `reports:admin`, which only Admins hold, so for the signed-in Demo Project Manager it was hidden from the bot. Change 136 proved the figures follow the target but wrongly assumed the signed-in user was an Admin. The product owner needs to set the target.

## Mock Delta

No screen changes. For a PM or Leadership user, "Change the utilisation target to 60%" in chat now makes a confirm card; for Finance the bot says plainly that the role may not change it. See [`136-reports-target-is-a-setting`](../136-reports-target-is-a-setting/change.md).

## Acceptance Criteria

1. **AC-1** A new narrow permission `reports:target` is declared by Reports and granted to Leadership and PM (Admin holds every permission). `set_utilisation_target` and its service check `reports:target`; `reports:admin` (holidays) is unchanged.
2. **AC-2** A PM and a Leadership user are offered `set_utilisation_target` and can change the target; a Finance user is not offered it and is refused.
3. **AC-3** The Reports bot rules say who may change it and that, if the tool is not offered, the user's role may not change it and an Admin, Leadership or PM can; they never send the user to a settings page.
4. **AC-4** Change 136's statement that only an Admin may change the target no longer holds; this change supersedes it.

## Tasks

- [x] `T1` — The permission, the grant, the tool and the service (AC-1, AC-2)
  Files: modules/reports/module.ts, server/settings.ts, mcp.ts, tests/target.test.ts
- [x] `T2` — The bot says who may and what to do (AC-3)
  Files: modules/reports/chat-rules.ts

## Verify

**Verdict:** PASS

- AC-1: pass — `reports:target` is declared and granted to Leadership and PM; the tool and the service check it; set_holiday still needs `reports:admin`.
- AC-2: pass — a test shows the tool is offered to Admin, PM and Leadership and not to Finance, that a PM can set the target (65), and that Finance is refused and the target stays. On the real database the signed-in Demo Project Manager is now offered `set_utilisation_target` and still not `set_holiday`.
- AC-3: pass — one rule added before the examples; none edited. NOT tried with the real bot: please ask it "Change the utilisation target to 60%" on localhost:3000; it should show a confirm card, and the page should follow once confirmed.
- AC-4: noted — change 136's test now covers PM and Leadership instead of "Admin only".

Type-check clean. Reports tests: 29 of 29 pass (one run hit a OneDrive file lock and was repeated). The change affects a company-wide setting, so any PM or Leadership user can now set the target for everyone; narrowing it is one line in module.ts.

