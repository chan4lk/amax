const sameSite = (value: unknown): value is string => typeof value === "string" && /^\/(?![/\\])/.test(value);

export const showOf = (result: unknown) => {
  const path = (result as { show?: unknown } | null)?.show;
  return sameSite(path) ? path : undefined;
};
