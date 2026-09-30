import { lazyComponent } from "@/lib";

// The tree host (@pierre/trees) is a large dependency that only the editor
// panel's explorer renders, so it loads when that panel first shows the tree.
export const FileTree = lazyComponent(
  async () => (await import("./file-tree")).FileTree,
);
