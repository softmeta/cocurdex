import { lazyComponent } from "@/lib";

export const ApplicationsView = lazyComponent(
  async () => (await import("./applications-view")).ApplicationsView,
);
