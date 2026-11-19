import { lazyComponent } from "@/lib";

export const RenderedPreview = lazyComponent(
  async () => (await import("./rendered-preview")).RenderedPreview,
);

export const DiagramActions = lazyComponent(
  async () => (await import("./rendered-preview")).DiagramActions,
);
