export const LIST_OPTION_FIELDS = [
  "grouping",
  "ordering",
  "rootLimit",
  "statuses",
  "agents",
  "environments",
] as const;

export type ListOptionField = (typeof LIST_OPTION_FIELDS)[number];

export function isListOptionField(value: unknown): value is ListOptionField {
  return LIST_OPTION_FIELDS.some((field) => field === value);
}

export function toggledValue<T>(values: readonly T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}
