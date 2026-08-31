import type {
  AgentEvent,
  AgentToolCallRecord,
  SessionRecord,
} from "@cocurdex/shared";
import type { CodexAppServerNotification } from "./codex-app-server-client";
import { getItem, isRecord } from "./codex-app-server-events";
import { createCodexTurnStream } from "./codex-turn-stream";

interface ChildState {
  session: SessionRecord;
  stream: ReturnType<typeof createCodexTurnStream>;
  toolCall: AgentToolCallRecord;
}

interface CodexSubagentRouterOptions {
  parentSession: SessionRecord;
  onEvent(event: AgentEvent): void;
  subscribe(
    providerSessionId: string,
    onNotification: (notification: CodexAppServerNotification) => void,
  ): void;
}

export class CodexSubagentRouter {
  private readonly children = new Map<string, ChildState>();

  constructor(private readonly options: CodexSubagentRouterOptions) {}

  getProviderSessionIds() {
    return this.children.keys();
  }

  transform(toolCall: AgentToolCallRecord): AgentToolCallRecord | null {
    const input = isRecord(toolCall.rawInput) ? toolCall.rawInput : null;
    if (input?.tool !== "spawnAgent") {
      if (toolCall.kind === "collaboration") {
        this.settle(toolCall.rawOutput);
        return null;
      }
      return toolCall;
    }

    const receiverThreadIds = Array.isArray(input.receiverThreadIds)
      ? input.receiverThreadIds
      : [];
    const providerSessionId = receiverThreadIds.find(
      (value): value is string => typeof value === "string",
    );
    if (!providerSessionId || !toolCall.subagent) {
      return toolCall;
    }

    const existing = this.children.get(providerSessionId);
    const projectedToolCall: AgentToolCallRecord = {
      ...toolCall,
      status: toolCall.status === "failed" ? "failed" : "in_progress",
    };
    const childSession: SessionRecord = {
      ...this.options.parentSession,
      id: toolCall.subagent.sessionId,
      title: toolCall.subagent.description,
      sessionKind: "subagent",
      parentSessionId: this.options.parentSession.id,
      parentToolCallId: toolCall.id,
      status: projectedToolCall.status === "failed" ? "error" : "running",
      createdAt: existing?.session.createdAt ?? toolCall.startedAt,
      updatedAt: toolCall.updatedAt,
      lastMessageAt: existing?.session.lastMessageAt ?? null,
      archivedAt: null,
    };
    const child =
      existing ??
      this.createChild(providerSessionId, childSession, projectedToolCall);
    child.session = childSession;
    child.toolCall = projectedToolCall;
    this.children.set(providerSessionId, child);
    this.emitSession(childSession);
    this.settle(toolCall.rawOutput);
    return projectedToolCall;
  }

  private createChild(
    providerSessionId: string,
    session: SessionRecord,
    toolCall: AgentToolCallRecord,
  ): ChildState {
    const nestedRouter = new CodexSubagentRouter({
      parentSession: session,
      onEvent: this.options.onEvent,
      subscribe: this.options.subscribe,
    });
    const child = {
      session,
      stream: createCodexTurnStream({
        sessionId: session.id,
        onEvent: this.options.onEvent,
        transformToolCall: (nestedToolCall) =>
          nestedRouter.transform(nestedToolCall),
      }),
      toolCall,
    };
    this.options.subscribe(providerSessionId, (notification) => {
      this.handleNotification(child, notification);
    });
    return child;
  }

  private handleNotification(
    child: ChildState,
    notification: CodexAppServerNotification,
  ) {
    switch (notification.method) {
      case "turn/started":
        child.stream.reset();
        break;
      case "item/agentMessage/delta":
        child.stream.handleAgentMessageDelta(notification.params);
        break;
      case "item/reasoning/summaryTextDelta":
        child.stream.handleReasoningSummaryDelta(notification.params);
        break;
      case "item/commandExecution/outputDelta":
      case "item/fileChange/outputDelta":
        child.stream.handleToolOutputDelta(notification.params);
        break;
      case "thread/tokenUsage/updated":
        child.stream.handleTokenUsage(notification.params);
        break;
      case "item/started":
      case "item/completed": {
        const item = getItem(notification.params);
        if (item) {
          child.stream.handleItem(
            item,
            notification.method === "item/completed",
          );
        }
        break;
      }
      case "turn/completed":
        child.stream.finishTurn();
        break;
    }
  }

  private settle(rawOutput: unknown) {
    const output = isRecord(rawOutput) ? rawOutput : null;
    const states = isRecord(output?.agentsStates) ? output.agentsStates : null;
    if (!states) {
      return;
    }

    for (const [providerSessionId, value] of Object.entries(states)) {
      const child = this.children.get(providerSessionId);
      const state = isRecord(value) ? value.status : null;
      if (!child || typeof state !== "string") {
        continue;
      }
      const failed = state === "errored" || state === "notFound";
      const completed =
        state === "completed" ||
        state === "shutdown" ||
        state === "interrupted";
      if (!failed && !completed) {
        continue;
      }

      const updatedAt = new Date().toISOString();
      child.toolCall = {
        ...child.toolCall,
        status: failed ? "failed" : "completed",
        updatedAt,
      };
      child.session = {
        ...child.session,
        status: failed ? "error" : "idle",
        updatedAt,
      };
      this.emitSession(child.session);
      this.options.onEvent({
        type: "tool.finished",
        sessionId: this.options.parentSession.id,
        toolCall: child.toolCall,
      });
    }
  }

  private emitSession(session: SessionRecord) {
    this.options.onEvent({
      type: "session.upserted",
      sessionId: session.id,
      session,
    });
  }
}
