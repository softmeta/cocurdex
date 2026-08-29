// Cross-feature chat primitives. Lives outside features/ on purpose:
// both features/chat (pure chat) and features/agent import from here.
// Keep this module small and dependency-free — anything that pulls Jotai
// atoms or feature-specific types belongs in the feature.
export type { JumpButtonKind } from "./jump-button";
export { resolveJumpButton } from "./jump-button";
export { JumpControls } from "./jump-controls";
export {
  isScrollNearBottom,
  isScrollNearTop,
  nextShouldStickToBottom,
  STICK_TO_BOTTOM_THRESHOLD,
  useStickToBottom,
} from "./use-stick-to-bottom";
export { clampOffset, useVerticalDrag } from "./use-vertical-drag";
