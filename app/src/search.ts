const normalized = (v: unknown) => String(v ?? "").normalize("NFKC").toLocaleLowerCase();
export function matchesSearch(row: {id: number; name?: string; key?: string; kind?: string}, query: string) {
  const text = normalized([row.id, row.name, row.key, row.kind].join(" "));
  return normalized(query).trim().split(/\s+/).every(term => text.includes(term));
}
export function isNamed(row: {name?: string}) { return !!row.name?.trim(); }
