# Marketing site: a public landing page that sells amax, with a short product video

**Change:** 101-marketing-site · **Created:** 2026-10-18
**Lane:** Platform · **Module:** `apps/web (public route, proxy), packages/auth (public paths)` · **Depends on:** [001](../archive/001-amax-foundation/change.md)

## Problem

A signed-out visitor who opens amax lands on the sign-in screen. Nothing tells a prospect what amax is, who it is for or why agent-native beats Jira, Monday or Kantata. We need a public page that sells the product, and shows it working, before anyone has an account.

## Mock Delta

What changes on screen, and where to see it: [`101-marketing-site`](../../mock/index.html#101-marketing-site)

A new public page with no app navigation: no rail, top bar or chat launcher. Top bar: logo, Features, How it works, Security, Sign in, "Book a demo". Hero: "Agents keep the records. People decide." with a 40-second product video (poster, play button, captions). Then: the problem (busywork in incumbent tools), how it works in three steps (agents write through MCP, amax asks before it changes anything, people review and decide), a feature grid by area (Delivery, People and payroll, Finance and sales, Operations, Platform), a trust band (every write attributed and audited, role-scoped MCP, region pinning, WCAG 2.2 AA), an "Ask amax" chat preview, and a closing call to action. All sample data is fictional. No testimonials, logos or numbers we don't have.

## Acceptance Criteria

1. **AC-1** A signed-out request to `/` gets the marketing page (HTTP 200, no redirect to `/signin`). A signed-in request to `/` still gets the app overview. Playwright checks both.
2. **AC-2** The page is public: it is listed in `isPublicPath`, renders without a database or session, and loads no app-shell, chat or tenant data. A unit test covers the new public path.
3. **AC-3** Sections in order: hero with video, problem, how it works (3 steps), features (5 areas, each naming real modules from `docs/roadmap.md` and marking unbuilt ones "Coming"), trust, chat preview, closing CTA, footer. Every claim matches `PRODUCT.md` or shipped modules. There are no testimonials, customer logos or invented metrics (rule 7).
4. **AC-4** "Sign in" links to `/signin`. "Book a demo" is a `mailto:` link whose address comes from config (`AMAX_SALES_EMAIL`), and the button hides when that is unset. The page has no forms (rule 1).
5. **AC-5** The product video is a 30–45 s MP4 (H.264, ≤ 8 MB) plus a WebM, recorded from the demo app with fictional data. It ships with a poster image and a WebVTT captions track. It does not autoplay with sound, it never autoplays under `prefers-reduced-motion`, and it has keyboard-reachable native controls.
6. **AC-6** WCAG 2.2 AA: axe reports no violations in light and dark themes. The page is keyboard-complete with a skip link and visible focus, and it has no horizontal scroll at 390 px.
7. **AC-7** SEO and sharing: the page sets title, description, canonical URL and Open Graph and Twitter tags with a 1200×630 image, and `robots.txt` and `sitemap.xml` list it. The app routes stay `noindex`.
8. **AC-8** Performance: Lighthouse on the production build scores ≥ 90 for performance and 100 for accessibility on mobile. The video loads lazily (`preload="none"` or `metadata`), so it adds no weight before the visitor presses play.
9. **AC-9** The page uses the app's design tokens (colour, radius, font, mascot) from `packages/ui`, so brand changes reach it with no separate stylesheet.
10. **AC-10** The page shows no app navigation: no rail, top bar, search, chat launcher or profile. Playwright asserts that none of them render for a signed-out visitor at `/`.
11. **AC-11** It is as colourful as the overview. The five feature areas use the overview ticket gradients (violet, mint, yellow, sky, pink) with the mock's 3D art. The hero, video poster and closing CTA use the brand mint-to-violet gradient.
12. **AC-12** The video is made with `brag` in the amax brand: logo, mascot, mint-to-violet gradient, the app font and the ticket colours. Its frames show real amax screens with fictional data.

## Open questions

- **Video tool:** `brag`, in brand (AC-12).
- **Domain:** should the marketing page live on the same host as the app (`/`), or on its own host (for example `amax.app` with the app on `app.amax.app`)? Default: same host.

## Tasks

- [x] `T1` — Marketing page UI matching the mock: hero, problem, how it works, feature tickets with art, trust band, chat preview, CTA and footer, using `packages/ui` tokens, `Logo`, `Mascot` and the ticket gradients. No app shell, no forms, and the demo link reads from `AMAX_SALES_EMAIL` (AC-3, AC-4, AC-6, AC-9, AC-10, AC-11)
  Files: apps/web/app/welcome/page.tsx, apps/web/app/welcome/welcome.module.css, apps/web/components/marketing/ProductVideo.tsx
- [x] `T2` — Product video made with `brag` (`brag-slim`) in brand. Inputs: logo, mascot, mint-to-violet gradient, app font, ticket colours, and screenshots of the demo app with fictional data. Outputs: an MP4 (H.264, ≤ 8 MB), a WebM, a poster and WebVTT captions. `ProductVideo` uses native controls, `preload="none"`, and no autoplay under reduced motion (AC-5, AC-8, AC-12)
  Files: apps/web/public/marketing/amax-product.mp4, apps/web/public/marketing/amax-product.webm, apps/web/public/marketing/amax-product-poster.jpg, apps/web/public/marketing/amax-product.en.vtt, apps/web/components/marketing/ProductVideo.tsx
  Depends: T1
- [x] `T3` — Routing: `/welcome` is a public path, and a signed-out `/` is rewritten (not redirected) to `/welcome`. A signed-in `/` still reaches the app overview. Update the gate unit tests (AC-1, AC-2)
  Files: packages/auth/src/gate.ts, packages/auth/tests/ac1-signin.test.ts, apps/web/proxy.ts
- [x] `T4` — SEO: metadata, canonical URL, Open Graph and Twitter tags with a 1200×630 image, `robots.ts` and `sitemap.ts` listing only the public page, and `noindex` on the `(app)` layout (AC-7)
  Files: apps/web/app/welcome/page.tsx, apps/web/app/welcome/opengraph-image.png, apps/web/app/robots.ts, apps/web/app/sitemap.ts, apps/web/app/(app)/layout.tsx
- [x] `T5` — Playwright: a signed-out `/` shows the marketing page with no rail, top bar or chat. A signed-in `/` shows the overview. axe passes in light and dark, there is no horizontal scroll at 390 px, the video has controls and captions, and a visual snapshot is taken. Run Lighthouse on mobile (AC-1, AC-5, AC-6, AC-8, AC-10)
  Files: apps/web/tests/e2e/marketing.spec.ts
  Depends: T1, T2, T3, T4

## Verify

**Verdict:** PASS

- AC-1: pass — `packages/auth/tests/062-ac1-landing.test.ts` (signed-out `/` rewrites to `/welcome`; signed-in and other paths are untouched), wired in `apps/web/proxy.ts`. `tests/e2e/landing.spec.ts` (both cases in the browser) needs Postgres and runs in CI `e2e:auth`; it was not run locally because Docker was down. The guest preview (no DATABASE_URL) keeps the app at `/` on purpose, since there is no sign-in and so no signed-out visitor.
- AC-2: pass — `/welcome`, `/robots.txt` and `/sitemap.xml` are in `isPublicPath` (unit test). The page renders with no database or session (production server with no DATABASE_URL returned 200). It loads no shell, chat or tenant data.
- AC-3: pass — sections in order (`marketing.spec` AC3). `marketing-areas.test.ts`: every live claim maps to an installed module, every Coming entry to a missing one, and no page prose names a Coming feature. `marketing-confirm.test.ts`: the confirm is claimed only for chat (fails on the old step 2). No testimonials, logos or metrics.
- AC-4: pass — no forms, "Sign in" goes to `/signin` (e2e). `tests/marketing-demo.test.ts`: with an email set, every call to action renders `mailto:sales@amax.example?subject=amax%20demo`; unset, there is no demo link and the closing shows Sign in.
- AC-5: pass — 35 s MP4 (H.264, 1920×1080, 1.4 MB) and WebM (VP9, 1.6 MB), a poster, and English WebVTT captions, made with `brag`. Native controls, `preload="none"`, no autoplay; the files are served signed out (e2e AC5).
- AC-6: pass — axe (wcag2a/aa, 21aa, 22aa) shows no violations in light and dark. The skip link takes first focus, and there is no horizontal scroll at 390 px (e2e AC6). Lighthouse accessibility: 100.
- AC-7: pass — canonical, Open Graph and Twitter tags with a 1200×630 image; `robots.txt` and `sitemap.xml` (e2e AC7). The `(app)` layout is `noindex`. With no AMAX_BASE_URL the page leaves out absolute URLs and warns once (`site-origin.test.ts`).
- AC-8: pass — Lighthouse 12.8.2 on the mobile production build: performance 98, accessibility 100, best practices 100, SEO 100. LCP 2.5 s, TBT 10 ms, CLS 0, 253 KiB before the video plays.
- AC-9: pass — the page uses `packages/ui` tokens, `Logo` and `Mascot`. Some ticket gradient stops are hard-coded, as in `components.css` itself (follow-up minor).
- AC-10: pass — no Main nav, search, chat launcher or profile menu, signed out (`marketing.spec` AC10, `landing.spec`).
- AC-11: pass — feature tiles use the five ticket gradients with 3D art, and the hero, video and CTA use the mint-to-violet gradient (screenshots).
- AC-12: pass — `brag-slim` video in brand: logo, mascot, gradient, Avenir Next, ticket colours, and real amax screens with fictional data (Lumen Labs, Contoso Portal, Fleet Tracker, Kasun Dias, Nimali Perera).

Commands (in the worktree):
- After merging origin/main (008, 013, 038): `pnpm turbo run test --continue --concurrency=3` → 0 (23/23 tasks, 11 modules), lint 0, build 0, `marketing.spec` 4 passed. 013 ships onboarding, 014 the payroll engine, 017 contracts and invoicing, 018 expenses and 023 recruitment, so the page lists them as live (15 modules, 28/28 test tasks). The Sri Lanka and Australia packs stay Coming. Re-run on 12 modules: 24/24 test tasks, lint, build and `marketing.spec` all pass.
- `pnpm turbo run test --continue --concurrency=3` → 0 (22/22 tasks; DB tests are skipped without DATABASE_MIGRATE_URL). A plain `pnpm test` hit a 5 s timeout in `@amax/testing` ac3-boundaries under full parallel load; it passes on its own and at lower concurrency, the same as CI's `--concurrency=2`.
- `pnpm lint` → 0 (tsc + graph check ok). `pnpm build` → 0. `node scripts/check-module-standard.mjs` → 0.
- `E2E_PORT=3510 npx playwright test tests/e2e/marketing.spec.ts` (production build, AMAX_BASE_URL set) → 4 passed.
- `specclaw-preset-check .` → 1: the repo-wide comment and line-length convention, the same exception as earlier changes. Nothing in this change breaks a non-comment rule.
- `specclaw-quality-scan . --gate` → 1: three high-complexity functions, all outside this change (`delivery/sync/specclaw.ts` parse, `AiSettingsPage`, `BackupTickets`). This change adds no new high functions or duplicates.
- Decision (the user, 2026-10-18, after review escalation in rounds 10–13): the automated time-claim guard was dropped. A regex test cannot cover every way of saying "hours get logged". Code review checks the marketing copy's time claims instead. The copy itself says commits draft hours that the person accepts, and the week is submitted before approval (`modules/time/suggestions.ts`, `modules/time/server/decide.ts`).
- Review: CLEAN — 21 rounds, final pass d7e8fbb168 (opus/opus), 0/0/2 b/M/m. CI round 1 failed AC-6 on Linux fonts (431 px at 390): fixed, and the e2e now forces a wide fallback font. CI round 2 failed in e2e:auth: sign-in helpers opened a signed-out / for the form. Every apps/web sign-in helper now starts from /signin for /. Rounds 9–13 corrected the time-logging and submit-before-approve claims across the page, video and mock.

Quality: 360 → 354 duplicated lines

Screenshots: `.specclaw/changes/101-marketing-site/shots/app.png`, `.specclaw/changes/101-marketing-site/shots/mock.png`
