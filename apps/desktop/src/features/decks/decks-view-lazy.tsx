import { lazyComponent } from "@/lib";

export const DecksView = lazyComponent(
  async () => (await import("./decks-view")).DecksView,
);
