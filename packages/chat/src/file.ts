export type FileRef = { href: string; title: string; detail: string; format: "pdf" | "docx" | "md" };

const sameSite = (value: unknown): value is string => typeof value === "string" && /^\/api\/(?![/\\])/.test(value);
const text = (value: unknown, max: number) => (typeof value === "string" && value.length > 0 && value.length <= max ? value : null);

export const fileOf = (result: unknown): FileRef | undefined => {
  const f = (result as { file?: Record<string, unknown> } | null)?.file;
  if (!f || !sameSite(f.href) || (f.format !== "pdf" && f.format !== "docx" && f.format !== "md")) return undefined;
  const title = text(f.title, 120), detail = text(f.detail, 200);
  return title && detail ? { href: f.href, title, detail, format: f.format } : undefined;
};
