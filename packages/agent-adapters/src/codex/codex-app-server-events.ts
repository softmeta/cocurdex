import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import type { AgentToolCallRecord, MessageAttachment } from "@cocurdex/shared";
import {
  assertNoDocumentAttachments,
  buildTextWithContextAttachments,
  splitAttachments,
} from "../shared";

interface ThreadItemBase {
  id: string;
  type: string;
}

export interface AgentMessageItem extends ThreadItemBase {
  type: "agentMessage";
  text: string;
}

export interface CommandExecutionItem extends ThreadItemBase {
  type: "commandExecution";
  command: string;
  status: "inProgress" | "completed" | "failed" | "declined";
  aggregatedOutput: string | null;
}

export interface FileChangeItem extends ThreadItemBase {
  type: "fileChange";
  changes: Array<{ path: string; diff?: string }>;
  status: "inProgress" | "completed" | "failed" | "declined";
}

export interface ReasoningItem extends ThreadItemBase {
  type: "reasoning";
  summary: string[];
  content: string[];
}

export interface McpToolCallItem extends ThreadItemBase {
  type: "mcpToolCall";
  server: string;
  tool: string;
  status: "inProgress" | "completed" | "failed";
  arguments: unknown;
  result: unknown;
  error: unknown;
}

export interface DynamicToolCallItem extends ThreadItemBase {
  type: "dynamicToolCall";
  namespace: string | null;
  tool: string;
  status: "inProgress" | "completed" | "failed";
  arguments: unknown;
  contentItems: unknown;
}

export interface CollabAgentToolCallItem extends ThreadItemBase {
  type: "collabAgentToolCall";
  tool: "spawnAgent" | "sendInput" | "resumeAgent" | "wait" | "closeAgent";
  status: "inProgress" | "completed" | "failed";
  senderThreadId: string;
  receiverThreadIds: string[];
  prompt: string | null;
  model: string | null;
  agentsStates: Record<
    string,
    {
      status:
        | "pendingInit"
        | "running"
        | "interrupted"
        | "completed"
        | "errored"
        | "shutdown"
        | "notFound";
      message?: string | null;
    }
  >;
}

// webSearch items carry no status; the lifecycle phase (item/started vs
// item/completed) is the only progress signal.
export interface WebSearchItem extends ThreadItemBase {
  type: "webSearch";
  query: string;
}

export type CodexToolItem =
  | CommandExecutionItem
  | FileChangeItem
  | McpToolCallItem
  | DynamicToolCallItem
  | CollabAgentToolCallItem
  | WebSearchItem;

export type CodexThreadItem =
  | AgentMessageItem
  | ReasoningItem
  | CodexToolItem
  | ThreadItemBase;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAgentMessageItem(
  item: CodexThreadItem,
): item is AgentMessageItem {
  return item.type === "agentMessage" && "text" in item;
}

export function isReasoningItem(item: CodexThreadItem): item is ReasoningItem {
  return item.type === "reasoning" && "summary" in item;
}

export function isToolItem(item: CodexThreadItem): item is CodexToolItem {
  return (
    (item.type === "commandExecution" && "command" in item) ||
    (item.type === "fileChange" && "changes" in item) ||
    (item.type === "mcpToolCall" && "tool" in item) ||
    (item.type === "dynamicToolCall" && "tool" in item) ||
    (item.type === "collabAgentToolCall" && "receiverThreadIds" in item) ||
    (item.type === "webSearch" && "query" in item)
  );
}

export function getItem(params: unknown): CodexThreadItem | null {
  if (!isRecord(params) || !isRecord(params.item)) {
    return null;
  }

  const item = params.item;

  if (typeof item.id !== "string" || typeof item.type !== "string") {
    return null;
  }

  return item as unknown as CodexThreadItem;
}

export function buildInput(content: string, attachments: MessageAttachment[]) {
  assertNoDocumentAttachments("Codex", attachments);
  const { images } = splitAttachments(attachments);
  const text =
    buildTextWithContextAttachments(content, attachments, {
      includeImageSummaries: false,
    }) || "Please analyze the attached image.";

  if (images.length === 0) {
    return [{ type: "text", text }];
  }

  return [
    { type: "text", text },
    ...images.map((attachment) => ({
      path: attachment.filePath,
      type: "localImage",
    })),
  ];
}

export function createSandboxPolicy(
  payload: CreateAgentSessionPayload,
  permissionMode = payload.session.permissionMode,
) {
  // Codex's own "Full Access" preset is danger-full-access, not a sandboxed
  // workspace: it may edit files outside the workspace and reach the network.
  // See codex-rs/utils/approval-presets/src/lib.rs.
  if (permissionMode === "codex-full-access") {
    return { type: "dangerFullAccess" };
  }

  if (
    payload.session.writeMode === "native-write" ||
    permissionMode === "codex-auto"
  ) {
    return {
      type: "workspaceWrite",
      writableRoots: [payload.workspaceRootPath],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    };
  }

  return {
    type: "readOnly",
    networkAccess: false,
  };
}

export function createToolCallRecord(
  sessionId: string,
  item: CodexToolItem,
  isCompleted: boolean,
): AgentToolCallRecord {
  const now = new Date().toISOString();
  const base = {
    sessionId,
    id: item.id,
    content: [],
    locations: [] as AgentToolCallRecord["locations"],
    startedAt: now,
    updatedAt: now,
  };

  switch (item.type) {
    case "commandExecution":
      return {
        ...base,
        title: item.command,
        kind: "exec",
        status: normalizeToolStatus(item.status),
        rawInput: { command: item.command },
        rawOutput: item.aggregatedOutput,
      };
    case "fileChange":
      return {
        ...base,
        title: item.changes.map((change) => change.path).join(", "),
        kind: "write",
        status: normalizeToolStatus(item.status),
        rawInput: { changes: item.changes },
        rawOutput: null,
        locations: item.changes.map((change) => ({ path: change.path })),
      };
    case "mcpToolCall":
      return {
        ...base,
        title: `${item.server}.${item.tool}`,
        kind: "mcp",
        status: normalizeToolStatus(item.status),
        rawInput: item.arguments,
        rawOutput: item.error ?? item.result ?? null,
      };
    case "dynamicToolCall":
      return {
        ...base,
        title: item.namespace ? `${item.namespace}.${item.tool}` : item.tool,
        kind: "tool",
        status: normalizeToolStatus(item.status),
        rawInput: item.arguments,
        rawOutput: item.contentItems ?? null,
      };
    case "webSearch":
      return {
        ...base,
        title: item.query,
        kind: "search",
        status: isCompleted ? "completed" : "in_progress",
        rawInput: { query: item.query },
        rawOutput: null,
      };
    case "collabAgentToolCall": {
      const receiverThreadId = item.receiverThreadIds[0] ?? null;
      const childSessionId = receiverThreadId
        ? `codex-subagent:${sessionId}:${receiverThreadId}`
        : null;
      return {
        ...base,
        title: item.tool === "spawnAgent" ? "Using subagent" : item.tool,
        kind: "collaboration",
        status: normalizeToolStatus(item.status),
        subagent:
          item.tool === "spawnAgent" && childSessionId
            ? {
                sessionId: childSessionId,
                type: item.model,
                description: item.prompt?.trim() || "Subagent",
              }
            : null,
        rawInput: {
          tool: item.tool,
          prompt: item.prompt,
          receiverThreadIds: item.receiverThreadIds,
        },
        rawOutput: { agentsStates: item.agentsStates },
      };
    }
  }
}

function normalizeToolStatus(
  status: "inProgress" | "completed" | "failed" | "declined",
): AgentToolCallRecord["status"] {
  if (status === "inProgress") {
    return "in_progress";
  }

  if (status === "completed") {
    return "completed";
  }

  return "failed";
}
