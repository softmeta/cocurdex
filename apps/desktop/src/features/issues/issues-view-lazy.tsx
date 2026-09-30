import { lazyComponent } from "@/lib";

export const IssuesView = lazyComponent(
  async () => (await import("./issues-view")).IssuesView,
);
