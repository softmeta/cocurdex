export function matchesQuery(
  option: { label: string; supporting?: string; group?: string },
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [option.label, option.supporting ?? "", option.group ?? ""].some(
    (text) => text.toLowerCase().includes(needle),
  );
}
