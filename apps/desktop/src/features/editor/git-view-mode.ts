export type GitViewMode = "list" | "tree";

// Below this container width the master-detail (tree) view cannot fit a file
// list beside a readable diff, so the stacked list reads better. At or above
// it the panel is wide enough for master-detail to use the space.
export const GIT_MASTER_DETAIL_MIN_WIDTH = 768;

// The view shown until the user makes a choice: master-detail, so a diff is
// always read next to the file tree. Dragging the panel below
// GIT_MASTER_DETAIL_MIN_WIDTH still falls back to the stacked list.
export const GIT_DEFAULT_VIEW_MODE: GitViewMode = "tree";

// Pick the view that best fits a given panel width. `width` of 0
// (pre-measurement) yields the list.
export function resolveViewModeForWidth(width: number): GitViewMode {
  return width >= GIT_MASTER_DETAIL_MIN_WIDTH ? "tree" : "list";
}

// Decide the next committed view mode on a panel width change. The view only
// follows the width while the user actively drags the panel divider; maximize,
// fullscreen, and window resize must never reorganize the view on their own, so
// any non-drag width change returns the current mode unchanged.
export function resolveViewModeOnResize(params: {
  current: GitViewMode | null;
  width: number;
  isUserResizing: boolean;
}): GitViewMode | null {
  if (!params.isUserResizing) {
    return params.current;
  }
  return resolveViewModeForWidth(params.width);
}
