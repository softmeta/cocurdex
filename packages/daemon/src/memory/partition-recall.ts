import type { MemoryRecallItem, MemoryRecallResult } from "@cocurdex/shared";

function rank(item: MemoryRecallItem) {
  return item.score ?? Number.NEGATIVE_INFINITY;
}

export function mergeRecallResults(
  results: MemoryRecallResult[],
  limit: number,
): MemoryRecallResult {
  const query = results[0]?.query ?? "";
  const failed = results.filter((result) => result.error);
  if (results.length > 0 && failed.length === results.length) {
    return { query, items: [], truncated: false, error: failed[0].error };
  }
  const best = new Map<string, MemoryRecallItem>();
  for (const result of results) {
    for (const item of result.items) {
      const current = best.get(item.id);
      if (!current || rank(item) > rank(current)) best.set(item.id, item);
    }
  }
  const items = [...best.values()].sort((a, b) => rank(b) - rank(a));
  return {
    query,
    items: items.slice(0, limit),
    truncated:
      items.length > limit || results.some((result) => result.truncated),
    error: null,
  };
}
