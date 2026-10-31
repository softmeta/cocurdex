export const STICK_TO_BOTTOM_THRESHOLD = 96;
export const STICK_TO_BOTTOM_RESUME_THRESHOLD = 8;

export function isScrollNearBottom(
  scrollHeight: number,
  clientHeight: number,
  scrollTop: number,
  threshold = STICK_TO_BOTTOM_THRESHOLD,
): boolean {
  return scrollHeight - clientHeight - scrollTop <= threshold;
}

export function isScrollNearTop(
  scrollTop: number,
  threshold = STICK_TO_BOTTOM_THRESHOLD,
): boolean {
  return scrollTop <= threshold;
}
