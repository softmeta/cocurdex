import { lazy, Suspense } from "react";
import type { TerminalPanelProps } from "./terminal-panel";

// xterm plus its addons is one of the largest renderer dependencies, and a
// terminal only exists once the user opens one. Splitting it out here keeps it
// off the startup bundle without changing how callers mount the panel.
const LazyTerminalPanel = lazy(async () => ({
  default: (await import("./terminal-panel")).TerminalPanel,
}));

export function TerminalPanel(props: TerminalPanelProps) {
  // No fallback: the panel is mounted behind `terminalEverActive` inside an
  // absolutely positioned layer, so an empty frame reads as the shell booting.
  return (
    <Suspense fallback={null}>
      <LazyTerminalPanel {...props} />
    </Suspense>
  );
}
