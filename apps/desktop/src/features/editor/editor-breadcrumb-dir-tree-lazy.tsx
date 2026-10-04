import { lazyComponent } from "@/lib";
import type { BreadcrumbDirTreeProps } from "./editor-breadcrumb-dir-tree";
import { BREADCRUMB_TREE_HOST_CLASS } from "./editor-breadcrumb-dir-tree-utils";

// Shares the tree host with the explorer (@pierre/trees) and only renders
// inside an open breadcrumb popover, so it loads on that first open.
export const BreadcrumbDirTree = lazyComponent<BreadcrumbDirTreeProps>(
  async () => (await import("./editor-breadcrumb-dir-tree")).BreadcrumbDirTree,
  <div className={BREADCRUMB_TREE_HOST_CLASS} />,
);
