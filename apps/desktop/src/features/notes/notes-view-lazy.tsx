import { lazyComponent } from "@/lib";

export const NotesView = lazyComponent(
  async () => (await import("./notes-view")).NotesView,
);
