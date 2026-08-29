// Re-export shared primitive — lives in components/chat so pure chat can
// share JumpControls / rail drag without importing the agent feature.
export { clampOffset, useVerticalDrag } from "@/components/chat";
