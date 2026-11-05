import { lazyComponent } from "@/lib";

export const RoutinesView = lazyComponent(
  async () => (await import("./routines-view")).RoutinesView,
);
