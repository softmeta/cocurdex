import { lazyComponent } from "@/lib";
import type { TerminalPanelProps } from "./terminal-panel";

export const TerminalPanel = lazyComponent<TerminalPanelProps>(
  async () => (await import("./terminal-panel")).TerminalPanel,
);
