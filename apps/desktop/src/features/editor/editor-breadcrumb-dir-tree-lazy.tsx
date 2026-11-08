import { lazyComponent } from "@/lib";
import type { BreadcrumbDirTreeProps } from "./editor-breadcrumb-dir-tree";
import { BREADCRUMB_TREE_HOST_CLASS } from "./editor-breadcrumb-dir-tree-utils";

export const BreadcrumbDirTree = lazyComponent<BreadcrumbDirTreeProps>(
  async () => (await import("./editor-breadcrumb-dir-tree")).BreadcrumbDirTree,
  <div className={BREADCRUMB_TREE_HOST_CLASS} />,
);
