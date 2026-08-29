import { lazy, Suspense } from "react";
import type { BreadcrumbDirTreeProps } from "./editor-breadcrumb-dir-tree";

// Shares the tree host with the explorer (@pierre/trees) and only renders
// inside an open breadcrumb popover, so it loads on that first open.
const LazyBreadcrumbDirTree = lazy(async () => ({
  default: (await import("./editor-breadcrumb-dir-tree")).BreadcrumbDirTree,
}));

export function BreadcrumbDirTree(props: BreadcrumbDirTreeProps) {
  return (
    <Suspense fallback={null}>
      <LazyBreadcrumbDirTree {...props} />
    </Suspense>
  );
}
