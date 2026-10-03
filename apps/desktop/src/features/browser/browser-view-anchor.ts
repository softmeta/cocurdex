import type { BrowserViewAnchor } from "@/lib/types";

export function learnBrowserViewAnchor(
  before: { start: number; size: number },
  after: { start: number; size: number },
  viewportDelta: number,
  current: BrowserViewAnchor | undefined,
): BrowserViewAnchor | undefined {
  if (viewportDelta === 0) return current;
  const moved = after.start - before.start;
  const grew = after.size - before.size;
  const near = (value: number, target: number) => Math.abs(value - target) <= 1;
  if (near(moved, viewportDelta) && near(grew, 0)) return "end";
  if (near(moved, 0) && near(grew, viewportDelta)) return "stretch";
  if (near(moved, 0) && near(grew, 0)) return "start";
  return current;
}
