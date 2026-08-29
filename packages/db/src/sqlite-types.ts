export type SqliteRow = Record<string, unknown>;

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toBoolean(value: unknown) {
  return Number(value) === 1;
}

export function toNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function toNullableNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}
