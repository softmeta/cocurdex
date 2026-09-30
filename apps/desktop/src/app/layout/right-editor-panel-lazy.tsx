import { lazyComponent } from "@/lib";
import type { RightEditorPanelProps } from "./right-editor-panel";

export const RightEditorPanel = lazyComponent<RightEditorPanelProps>(
  async () => (await import("./right-editor-panel")).RightEditorPanel,
);
