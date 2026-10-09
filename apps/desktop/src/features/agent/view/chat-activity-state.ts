import {
  type AgentToolCallRecord,
  type MessageRecord,
  type SessionStatus,
  WORKTREE_SETUP_TOOL_KIND,
} from "@cocurdex/shared";

// `kind` doubles as the i18n key suffix (`agent:activity.<kind>`), so a renamed
// state fails to compile instead of silently falling through to "ready".
export type ActivityKind =
  | "attention"
  | "completed"
  | "planning"
  | "ready"
  | "responding"
  | "thinking"
  | "usingTools";

export type ActivityStep =
  | { headline: string; kind: "reasoning" }
  | { kind: "toolCall"; toolCall: AgentToolCallRecord };

export type ActivityState = {
  activeToolCalls?: AgentToolCallRecord[];
  kind: ActivityKind;
  latestStep?: ActivityStep;
  tone: "complete" | "error" | "muted" | "running";
  toolActivityId?: string;
};

function isActiveToolCall(toolCall: AgentToolCallRecord) {
  return toolCall.status === "pending" || toolCall.status === "in_progress";
}

export function isWorktreeSetupToolCall(toolCall: AgentToolCallRecord) {
  return toolCall.kind === WORKTREE_SETUP_TOOL_KIND;
}

export function isActivityHeaderBusy(input: {
  hasActiveToolCall: boolean;
  isLastSegment: boolean;
  isLiveConversation: boolean;
}) {
  return (
    input.isLiveConversation && (input.hasActiveToolCall || input.isLastSegment)
  );
}

function startedAfter(toolCall: AgentToolCallRecord, message: MessageRecord) {
  if (toolCall.seq !== undefined && message.seq !== undefined) {
    return toolCall.seq > message.seq;
  }
  return Date.parse(toolCall.startedAt) > Date.parse(message.createdAt);
}

function isStreamingResponse(
  message: MessageRecord,
  toolCalls: AgentToolCallRecord[],
) {
  return (
    message.kind !== "reasoning" &&
    message.content.trim().length > 0 &&
    !toolCalls.some((toolCall) => startedAfter(toolCall, message))
  );
}

type ReasoningLine = { isTitle: boolean; text: string };

function parseReasoningLine(line: string): ReasoningLine | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("<!--")) {
    return null;
  }
  const isHeading = trimmed.startsWith("#");
  const text = trimmed.replace(/^#+/, "").trim();
  if (!text.startsWith("**")) {
    return text ? { isTitle: isHeading, text } : null;
  }
  const boldEnd = text.indexOf("**", 2);
  if (boldEnd < 0) {
    return null;
  }
  const title = `${text.slice(2, boldEnd)}${text.slice(boldEnd + 2)}`.trim();
  return title ? { isTitle: true, text: title } : null;
}

export function getReasoningHeadline(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map(parseReasoningLine)
    .filter((line): line is ReasoningLine => line !== null);
  return (
    lines.findLast((line) => line.isTitle)?.text ?? lines.at(-1)?.text ?? null
  );
}

function getLatestReasoningHeadline(messages: MessageRecord[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role === "user") {
      return null;
    }
    const headline =
      message.kind === "reasoning"
        ? getReasoningHeadline(message.content)
        : null;
    if (headline) {
      return { headline, message };
    }
  }
  return null;
}

function getLatestStep(
  messages: MessageRecord[],
  latestToolCall: AgentToolCallRecord | undefined,
): ActivityStep | null {
  const reasoning = getLatestReasoningHeadline(messages);
  if (
    latestToolCall &&
    (!reasoning || startedAfter(latestToolCall, reasoning.message))
  ) {
    return { kind: "toolCall", toolCall: latestToolCall };
  }
  return reasoning ? { headline: reasoning.headline, kind: "reasoning" } : null;
}

export function getActivityState({
  isRunning,
  messages,
  status,
  toolCalls,
}: {
  isRunning: boolean;
  messages: MessageRecord[];
  status?: SessionStatus;
  toolCalls: AgentToolCallRecord[];
}): ActivityState {
  const latestMessage = messages.at(-1);

  if (status === "error") {
    return { kind: "attention", tone: "error" };
  }

  const latestUserMessage = messages.findLast(
    (message) => message.role === "user",
  );
  const latestToolCall = toolCalls.findLast(
    (toolCall) =>
      !isWorktreeSetupToolCall(toolCall) &&
      (!latestUserMessage || startedAfter(toolCall, latestUserMessage)),
  );
  const runningState = {
    tone: "running" as const,
    toolActivityId: latestToolCall?.id,
  };
  const activeToolCalls = toolCalls.filter(
    (toolCall) =>
      isActiveToolCall(toolCall) && !isWorktreeSetupToolCall(toolCall),
  );
  if (isRunning && activeToolCalls.length > 0) {
    return {
      activeToolCalls,
      kind: "usingTools",
      ...runningState,
    };
  }

  if (!isRunning) {
    return latestMessage?.role === "assistant"
      ? { kind: "completed", tone: "complete" }
      : { kind: "ready", tone: "muted" };
  }

  if (
    latestMessage?.role === "assistant" &&
    isStreamingResponse(latestMessage, toolCalls)
  ) {
    return { kind: "responding", ...runningState };
  }

  const latestStep = getLatestStep(messages, latestToolCall);
  return {
    kind: latestMessage?.role === "assistant" ? "thinking" : "planning",
    ...runningState,
    ...(latestStep ? { latestStep } : {}),
  };
}

export function formatDurationMs(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function formatElapsed(elapsedMs: number) {
  return formatDurationMs(Math.floor(Math.max(0, elapsedMs) / 1000) * 1000);
}

const TOOL_CALL_REVEAL_DELAY_MS = 400;
const TOOL_CALL_MIN_VISIBLE_MS = 800;

export type ShownToolCall = { at: number; toolCall: AgentToolCallRecord };

export function getShownToolCallChangeDelay({
  activeToolCallId,
  now,
  shown,
}: {
  activeToolCallId: string | null;
  now: number;
  shown: ShownToolCall | null;
}): number | null {
  if (activeToolCallId === (shown?.toolCall.id ?? null)) {
    return null;
  }

  const remainingVisibleMs = shown
    ? Math.max(0, shown.at + TOOL_CALL_MIN_VISIBLE_MS - now)
    : 0;

  if (activeToolCallId === null) {
    return remainingVisibleMs;
  }

  return Math.max(TOOL_CALL_REVEAL_DELAY_MS, remainingVisibleMs);
}

const STEP_MIN_VISIBLE_MS = 1500;

export type ShownStep = { at: number; key: string; step: ActivityStep };

export function getActivityStepKey(step: ActivityStep) {
  return step.kind === "reasoning"
    ? `reasoning:${step.headline}`
    : `toolCall:${step.toolCall.id}`;
}

export function getShownStepChangeDelay({
  activeKey,
  now,
  shown,
}: {
  activeKey: string | null;
  now: number;
  shown: Pick<ShownStep, "at" | "key"> | null;
}): number | null {
  if (activeKey === (shown?.key ?? null)) {
    return null;
  }
  if (!shown) {
    return 0;
  }
  return Math.max(0, shown.at + STEP_MIN_VISIBLE_MS - now);
}
