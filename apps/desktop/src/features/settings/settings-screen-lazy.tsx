import { lazyComponent } from "@/lib";
import type { SettingsScreenProps } from "./settings-screen";

export const SettingsScreen = lazyComponent<SettingsScreenProps>(
  async () => (await import("./settings-screen")).SettingsScreen,
);
