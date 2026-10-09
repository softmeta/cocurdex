import type {
  OnUserDialog,
  UserDialogRequest,
  UserDialogResult,
} from "@anthropic-ai/claude-agent-sdk";
import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";

export const CLAUDE_SUPPORTED_DIALOG_KINDS = ["resume_return"];

const RESUME_COMPACT_LABEL = "Compact and continue";
const RESUME_CONTINUE_LABEL = "Keep full history";
const RESUME_NEVER_LABEL = "Never ask again";

const resumeResultByLabel: Record<string, "compact" | "continue" | "never"> = {
  [RESUME_COMPACT_LABEL]: "compact",
  [RESUME_CONTINUE_LABEL]: "continue",
  [RESUME_NEVER_LABEL]: "never",
};

function readNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function formatIdleDuration(minutes: number) {
  const totalMinutes = Math.round(minutes);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  const remainingMinutes = totalMinutes % 60;
  if (hours > 0) {
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  }
  return `${totalMinutes}m`;
}

function formatTokenEstimate(tokens: number) {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  return `${Math.round(tokens / 1000)}k`;
}

export function formatClaudeResumeReturnQuestion(
  payload: Record<string, unknown>,
) {
  const idle = formatIdleDuration(
    readNonNegativeNumber(payload.sessionAgeMinutes),
  );
  const tokens = formatTokenEstimate(
    readNonNegativeNumber(payload.estimatedTokens),
  );
  return `This session has been idle for ${idle} and its prompt cache has expired. Continuing re-sends about ${tokens} tokens of history. Compact it first?`;
}

export function mapClaudeResumeReturnAnswer(
  answer: string | null,
): UserDialogResult {
  const result = answer ? resumeResultByLabel[answer] : undefined;
  return result ? { behavior: "completed", result } : { behavior: "cancelled" };
}

async function askResumeReturn(
  payload: CreateAgentSessionPayload,
  request: UserDialogRequest,
  requestId: string,
): Promise<UserDialogResult> {
  if (!payload.requestQuestion) {
    return { behavior: "cancelled" };
  }

  const answer = await payload.requestQuestion({
    id: request.toolUseID ?? requestId,
    sessionId: payload.session.id,
    providerId: payload.session.agentType,
    header: "Resume session",
    question: formatClaudeResumeReturnQuestion(request.payload),
    options: [
      {
        label: RESUME_COMPACT_LABEL,
        description: "Summarize the history and continue with fewer tokens.",
      },
      {
        label: RESUME_CONTINUE_LABEL,
        description: "Resume without changing the conversation.",
      },
      {
        label: RESUME_NEVER_LABEL,
        description: "Keep full history and skip this prompt from now on.",
      },
    ],
    multiSelect: false,
  });
  return mapClaudeResumeReturnAnswer(answer);
}

export function createClaudeOnUserDialog(
  payload: CreateAgentSessionPayload,
): OnUserDialog {
  return async (request, { requestId }) => {
    if (request.dialogKind === "resume_return") {
      return askResumeReturn(payload, request, requestId);
    }
    return { behavior: "cancelled" };
  };
}
