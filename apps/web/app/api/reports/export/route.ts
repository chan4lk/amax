import { ExportQuery, ExportRefused, buildExport } from "@amax/reports/contracts";
import { getViewer } from "../../../../lib/viewer";

export const dynamic = "force-dynamic";

const refuse = (status: number, text: string) => new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(req: Request) {
  const viewer = await getViewer();
  const q = ExportQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!viewer || !q.success || q.data.for !== viewer.userId) return refuse(404, "This report link isn't yours or is no longer valid. Ask amax for a new one.");
  const { for: _owner, ...query } = q.data;
  try {
    const f = await buildExport(viewer, query, true);
    return new Response(new Uint8Array(f.body), { headers: { "content-type": f.contentType, "content-disposition": `attachment; filename="${f.filename}"`, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ExportRefused) return refuse(403, e.message);
    throw e;
  }
}
