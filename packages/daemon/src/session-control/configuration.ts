import type { SessionConfiguration, SessionRecord } from "@cocurdex/shared";
import { validateSessionConfiguration } from "@cocurdex/shared";

export function applySessionConfiguration(
  input: SessionConfiguration,
  existing: SessionRecord | null,
  now: string,
): SessionRecord {
  validateSessionConfiguration(input);
  if (existing && existing.workspaceId !== input.workspaceId) {
    throw new Error("A session cannot change its workspace");
  }
  if (existing?.archivedAt)
    throw new Error("Restore the session before changing its configuration");
  return {
    status: "idle",
    createdAt: now,
    lastMessageAt: null,
    ...existing,
    ...input,
    updatedAt: now,
  };
}
