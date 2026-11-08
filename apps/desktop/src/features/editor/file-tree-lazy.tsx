import { lazyComponent } from "@/lib";

export const FileTree = lazyComponent(
  async () => (await import("./file-tree")).FileTree,
);
