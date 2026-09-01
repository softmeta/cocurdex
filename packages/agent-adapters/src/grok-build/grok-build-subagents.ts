import type { SessionNotification, StopReason } from "@agentclientprotocol/sdk";
import type { AgentToolCallRecord } from "@cocurdex/shared";
import type {
  AcpSubagentProtocol,
  AcpSubagentSettlement,
} from "../acp/acp-subagent-bridge";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  const record = asRecord(value);
  if (!record) {
    return "";
  }
  if (typeof record.text === "string") {
    return record.text;
  }
  return Object.values(record).map(readText).find(Boolean) ?? "";
}

function readSpawn(toolCall: AgentToolCallRecord) {
  const input = asRecord(toolCall.rawInput);
  const variant = input?.variant;
  const isSpawn =
    variant === "Task" ||
    toolCall.title === "spawn_subagent" ||
    toolCall.title === "Subagent";
  if (!isSpawn) {
    return null;
  }
  const rawOutput = asRecord(toolCall.rawOutput);
  const output = readText(toolCall.rawOutput || toolCall.content);
  const providerSessionId =
    (typeof rawOutput?.subagent_id === "string"
      ? rawOutput.subagent_id
      : null) ??
    output.match(/subagent_id:\s*([^\s]+)/)?.[1] ??
    null;
  const type =
    (typeof input?.subagent_type === "string" ? input.subagent_type : null) ??
    output.match(/(?:^|\n)type:\s*([^\n]+)/)?.[1]?.trim() ??
    null;
  const description =
    (typeof input?.description === "string" && input.description.trim()) ||
    output.match(/(?:^|\n)description:\s*([^\n]+)/)?.[1]?.trim() ||
    toolCall.title;
  const status =
    rawOutput?.type === "SubagentCompleted" ? ("completed" as const) : null;
  return {
    kind: "spawn" as const,
    providerSessionId,
    ...(status ? { status } : {}),
    type,
    description,
  };
}

function readSubagentNotification(method: string, params: unknown) {
  if (method !== "x.ai/session/update") {
    return null;
  }
  const update = asRecord(asRecord(params)?.update);
  let providerSessionId: string | null = null;
  if (typeof update?.child_session_id === "string") {
    providerSessionId = update.child_session_id;
  } else if (typeof update?.subagent_id === "string") {
    providerSessionId = update.subagent_id;
  }
  if (!providerSessionId) {
    return null;
  }
  if (update?.sessionUpdate === "subagent_finished") {
    return {
      kind: "settlement" as const,
      results: [
        {
          providerSessionId,
          status: readResultStatus(update.status),
        },
      ],
    };
  }
  if (update?.sessionUpdate !== "subagent_spawned") {
    return null;
  }
  return {
    providerSessionId,
    type:
      typeof update.subagent_type === "string" ? update.subagent_type : null,
    description:
      typeof update.description === "string" ? update.description : "Subagent",
  };
}

function readResultStatus(value: unknown) {
  if (value === "failed" || value === "error") {
    return "failed" as const;
  }
  if (value === "completed") {
    return "completed" as const;
  }
  return "in_progress" as const;
}

function readSettlement(toolCall: AgentToolCallRecord) {
  const input = asRecord(toolCall.rawInput);
  const output = asRecord(toolCall.rawOutput);
  if (
    input?.variant !== "TaskOutput" &&
    output?.type !== "TaskOutput" &&
    toolCall.title !== "get_command_or_subagent_output"
  ) {
    return null;
  }
  const multiResult = asRecord(output?.MultiResult);
  const singleResult = asRecord(output?.Result);
  let values: unknown[] = [];
  if (Array.isArray(multiResult?.results)) {
    values = multiResult.results;
  } else if (singleResult) {
    values = [singleResult];
  }
  const results: AcpSubagentSettlement["results"] = [];
  for (const value of values) {
    const result = asRecord(value);
    if (typeof result?.task_id !== "string") {
      continue;
    }
    results.push({
      providerSessionId: result.task_id,
      status: readResultStatus(result.status),
    });
  }
  return { kind: "settlement" as const, results };
}

function mapSessionNotification(method: string, params: unknown) {
  if (method !== "x.ai/session/update") {
    return null;
  }
  const notification = asRecord(params);
  if (
    typeof notification?.sessionId !== "string" ||
    !asRecord(notification.update)
  ) {
    return null;
  }
  return params as SessionNotification;
}

function readTurnCompletion(method: string, params: unknown) {
  if (method !== "x.ai/session/update") {
    return null;
  }
  const notification = asRecord(params);
  const update = asRecord(notification?.update);
  if (
    typeof notification?.sessionId !== "string" ||
    update?.sessionUpdate !== "turn_completed"
  ) {
    return null;
  }
  const stopReason: StopReason =
    update.stop_reason === "cancelled" ||
    update.stop_reason === "max_tokens" ||
    update.stop_reason === "refusal"
      ? update.stop_reason
      : "end_turn";
  return {
    providerSessionId: notification.sessionId,
    stopReason,
    durationMs: typeof update.elapsed_ms === "number" ? update.elapsed_ms : 0,
  };
}

export const grokBuildSubagentProtocol: AcpSubagentProtocol = {
  notificationMethods: ["x.ai/session/update"],
  replayLinkedSession: true,
  inspect(toolCall) {
    return readSettlement(toolCall) ?? readSpawn(toolCall);
  },
  inspectNotification(method, params) {
    return readSubagentNotification(method, params);
  },
  mapSessionNotification,
  readTurnCompletion,
};
