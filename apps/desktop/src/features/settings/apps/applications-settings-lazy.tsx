import { lazyComponent } from "@/lib";

export const ApplicationsSettingsPanel = lazyComponent(
  async () =>
    (await import("./applications-settings")).ApplicationsSettingsPanel,
);
