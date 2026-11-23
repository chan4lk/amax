import { REPORT_EXPORT_SLOT, provided, type ReportExport } from "@amax/core/server";
import { contextForViewer } from "@amax/auth";
import { installed } from "../../../../lib/registry";
import { getViewer } from "../../../../lib/viewer";

export const dynamic = "force-dynamic";

const refuse = (status: number, text: string) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(req: Request) {
  const [handle] = installed.length ? provided<ReportExport>(REPORT_EXPORT_SLOT) : [];
  const viewer = await getViewer();
  if (!handle || !viewer) return refuse(404, "This report link isn't yours or is no longer valid. Ask amax for a new one.");
  const r = await handle(contextForViewer(viewer, "ui"), Object.fromEntries(new URL(req.url).searchParams));
  if (!("filename" in r)) return refuse(r.status, r.text);
  return new Response(r.body, { headers: { "content-type": r.contentType, "content-disposition": `attachment; filename="${r.filename}"`, "cache-control": "no-store" } });
}
