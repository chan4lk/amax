import { viewerOf } from "@amax/auth";
import type { ReportExport } from "@amax/core/server";
import { buildExport, ExportQuery } from "./export";
import { ExportRefused } from "./export-data";

export const NOT_YOURS = "This report link isn't yours or is no longer valid. Ask amax for a new one.";

export const reportExport: ReportExport = async (ctx, params) => {
  const viewer = viewerOf(ctx);
  const q = ExportQuery.safeParse(params);
  if (!viewer || !q.success || q.data.for !== viewer.userId) return { status: 404, text: NOT_YOURS };
  const { for: _owner, ...query } = q.data;
  try {
    const f = await buildExport(viewer, query, true);
    return { status: 200, filename: f.filename, contentType: f.contentType, body: new Uint8Array(f.body) };
  } catch (e) {
    if (e instanceof ExportRefused) return { status: 403, text: e.message };
    throw e;
  }
};
