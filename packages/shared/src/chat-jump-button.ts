export type JumpButtonKind = "top" | "latest" | null;

export function resolveJumpButton({
  isReady,
  isNearTop,
  isNearBottom,
  scrollDirection,
  streaming = false,
}: {
  isReady: boolean;
  isNearTop: boolean;
  isNearBottom: boolean;
  scrollDirection: "up" | "down";
  streaming?: boolean;
}): JumpButtonKind {
  if (!isReady || isNearBottom) {
    return null;
  }

  if (streaming || isNearTop) {
    return "latest";
  }

  return scrollDirection === "up" ? "top" : "latest";
}

export type ScrollDirection = "up" | "down";

export function scrollDirectionOfDelta(deltaY: number | undefined) {
  if (!deltaY) return null;
  return deltaY > 0 ? "down" : "up";
}

export function resolveScrollDirection({
  current,
  scrollDelta,
  inputDirection,
  hasRecentUserScrollIntent,
}: {
  current: ScrollDirection;
  scrollDelta: number;
  inputDirection: ScrollDirection | null;
  hasRecentUserScrollIntent: boolean;
}): ScrollDirection {
  if (!hasRecentUserScrollIntent) return current;
  return inputDirection ?? scrollDirectionOfDelta(scrollDelta) ?? current;
}
