import type { ServiceContext } from "./authorize";

/**
 * 112 AC-3: slots the app reads, declared once here, where both the app and the module that fills one import them. A
 * module fills a slot through its manifest's `provides`; the app reads it with `provided()` (see docs/architecture.md).
 */

/** GitHub's return to /api/git/github/callback: the module turns its query into the Git accounts screen's query. */
export const GITHUB_CALLBACK_SLOT = "app.github-callback";
export type GitHubCallback = (ctx: ServiceContext, params: Record<string, string>) => Promise<Record<string, string>>;

export const REPORT_EXPORT_SLOT = "app.report-export";
export type ReportDownload = { status: number; text: string } | { status: 200; filename: string; contentType: string; body: Uint8Array<ArrayBuffer> };
export type ReportExport = (ctx: ServiceContext, params: Record<string, string>) => Promise<ReportDownload>;
