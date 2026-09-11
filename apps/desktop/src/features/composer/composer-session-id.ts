export function resolveComposerSessionId(
  boundSessionId: string | null | undefined,
): string | null {
  return boundSessionId ?? null;
}
