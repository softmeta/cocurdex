export function matchesQuery(
  option: { label: string; supporting?: string },
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [option.label, option.supporting ?? ""].some((text) =>
    text.toLowerCase().includes(needle),
  );
}
