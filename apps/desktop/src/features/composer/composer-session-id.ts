export function resolveComposerSessionId(
  boundSessionId: string | null | undefined,
  activeSessionId: string | null,
): string | null {
  if (boundSessionId !== undefined) {
    return boundSessionId;
  }
  return activeSessionId;
}
