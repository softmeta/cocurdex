const NEXT_KEYS = new Set([
  "ArrowRight",
  "ArrowDown",
  "PageDown",
  " ",
  "Enter",
  "n",
]);
const PREVIOUS_KEYS = new Set([
  "ArrowLeft",
  "ArrowUp",
  "PageUp",
  "Backspace",
  "p",
]);

const FILMSTRIP_KEYS = new Set([
  "ArrowRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowUp",
  "PageDown",
  "PageUp",
  "Home",
  "End",
]);

export function filmstripIndexForKey(
  key: string,
  index: number,
  count: number,
): number | null {
  return FILMSTRIP_KEYS.has(key) ? slideIndexForKey(key, index, count) : null;
}

export function slideIndexForKey(
  key: string,
  index: number,
  count: number,
): number | null {
  if (count === 0) return null;
  if (NEXT_KEYS.has(key)) return Math.min(index + 1, count - 1);
  if (PREVIOUS_KEYS.has(key)) return Math.max(index - 1, 0);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
