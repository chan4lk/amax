import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3500); // parallel worktrees set their own

export default defineConfig({
  testDir: "tests/e2e",
  // Signed-in flows need Postgres: playwright.auth.config.ts (pnpm e2e:auth).
  testIgnore: /(admin|auth|delivery|sections|delivery-visual|ai|ai-usage|mcp|chat|chat-first|pins|releases|secrets|workflows|audit|retention|retention-visual|api|api-visual|notifications|suggestions|backups|backups-visual|landing|overview|set-up-project|set-up-project-fields|project-team|git-accounts|project-tabs|release-pages)\.spec\.ts|amx\.setup\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, colorScheme: "light", reducedMotion: "reduce", browserName: "chromium" },
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    // 062: the marketing page's canonical, Open Graph and sitemap URLs need a known public origin.
    env: { AMAX_BASE_URL: `http://localhost:${port}` },
  },
});
