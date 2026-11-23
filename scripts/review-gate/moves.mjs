const NUMBERED = /^(\d{3,})-(.+)$/;
const slugOf = (dir) => NUMBERED.exec(dir)?.[2];
const neutral = (text, names) => names.reduce((out, name) => out.split(name).join("\0change\0"), text);

export function movedFrom(name, { baseDirs, headDirs, filesAt }) {
  const slug = slugOf(name);
  if (!slug || baseDirs.includes(name)) return null;
  const olds = baseDirs.filter((d) => slugOf(d) === slug && !headDirs.includes(d));
  const news = headDirs.filter((d) => slugOf(d) === slug && !baseDirs.includes(d));
  if (olds.length !== 1 || news.length !== 1) return null;
  const [old] = olds;
  const before = filesAt("base", old), after = filesAt("head", name);
  const same = before.size > 0 && before.size === after.size
    && [...before].every(([path, body]) => after.has(path) && neutral(after.get(path), [name, old]) === neutral(body, [name, old]));
  return same ? old : null;
}
