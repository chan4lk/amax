import { CATEGORY_FILTERS, listHref, SORTS, STATUS_FILTERS } from "../server/release-list";

type Query = Record<string, string | undefined>;

function Group({ label, name, options, root, query }: { label: string; name: string; options: readonly (readonly [string, string])[]; root: string; query: Query }) {
  return (
    <nav className="seg" aria-label={label}>
      {options.map(([value, text]) => (
        <a key={value || "all"} href={listHref(root, query, { [name]: value || undefined })} aria-current={(query[name] ?? "") === value ? "true" : undefined}>{text}</a>
      ))}
    </nav>
  );
}

export function ReleaseFilters({ root, query }: { root: string; query: Query }) {
  return (
    <div className="rel-filters">
      <Group label="Status" name="status" options={STATUS_FILTERS} root={root} query={query} />
      <Group label="Category" name="category" options={CATEGORY_FILTERS} root={root} query={query} />
      <Group label="Sort" name="sort" options={SORTS} root={root} query={query} />
    </div>
  );
}
