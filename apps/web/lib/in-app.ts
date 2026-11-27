export const inApp = (url: string) => /^\/(?![/\\])[^\s\x00-\x1f\x7f]*$/.test(url);
