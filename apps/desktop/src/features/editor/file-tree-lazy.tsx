import { lazy, Suspense } from "react";

// The tree host (@pierre/trees) is a large dependency that only the editor
// panel's explorer renders, so it loads when that panel first shows the tree.
const LazyFileTree = lazy(async () => ({
  default: (await import("./file-tree")).FileTree,
}));

export function FileTree() {
  return (
    <Suspense fallback={null}>
      <LazyFileTree />
    </Suspense>
  );
}
