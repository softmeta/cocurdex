import { lazyComponent } from "@/lib";
import type { TerminalPanelProps } from "./terminal-panel";

// xterm plus its addons is one of the largest renderer dependencies, and a
// terminal only exists once the user opens one. Splitting it out here keeps it
// off the startup bundle without changing how callers mount the panel.
export const TerminalPanel = lazyComponent<TerminalPanelProps>(
  async () => (await import("./terminal-panel")).TerminalPanel,
);
