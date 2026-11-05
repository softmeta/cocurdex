import { lazyComponent } from "@/lib";

export const MemoryLibraryView = lazyComponent(
  async () => (await import("./memory-library-view")).MemoryLibraryView,
);
