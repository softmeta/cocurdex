import type { CommitMessageModelSelection } from "@cocurdex/shared";

export function parseCommitMessageModelSetting(
  raw: string | null,
): CommitMessageModelSelection | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CommitMessageModelSelection>;
    if (
      typeof parsed.agentId === "string" &&
      typeof parsed.providerId === "string" &&
      typeof parsed.modelId === "string"
    ) {
      return {
        agentId: parsed.agentId as CommitMessageModelSelection["agentId"],
        providerId: parsed.providerId,
        modelId: parsed.modelId,
        reasoningEffort:
          typeof parsed.reasoningEffort === "string"
            ? parsed.reasoningEffort
            : null,
        thinkingLevel:
          typeof parsed.thinkingLevel === "string"
            ? parsed.thinkingLevel
            : null,
        serviceTier:
          typeof parsed.serviceTier === "string" ? parsed.serviceTier : null,
        fastMode: typeof parsed.fastMode === "boolean" ? parsed.fastMode : null,
        openCodeAgent:
          typeof parsed.openCodeAgent === "string"
            ? parsed.openCodeAgent
            : null,
        openCodeVariant:
          typeof parsed.openCodeVariant === "string"
            ? parsed.openCodeVariant
            : null,
      };
    }
  } catch {
    return null;
  }
  return null;
}
