import {
  type AgentEvent,
  type AgentToolCallRecord,
  type ContextCompactionResult,
  type ContextCompactionTrigger,
  createContextCompactionToolCall,
  finishContextCompactionToolCall,
} from "@cocurdex/shared";

export interface ContextCompactionStart {
  id?: string;
  trigger?: ContextCompactionTrigger | null;
}

export type ContextCompactionTracker = ReturnType<
  typeof createContextCompactionTracker
>;

export function createContextCompactionTracker(input: {
  sessionId: string;
  emit(event: AgentEvent): void;
}) {
  let active: AgentToolCallRecord | null = null;

  function start(options: ContextCompactionStart = {}) {
    if (active) {
      return active;
    }
    active = createContextCompactionToolCall({
      id: options.id ?? crypto.randomUUID(),
      sessionId: input.sessionId,
      trigger: options.trigger,
    });
    input.emit({
      type: "tool.started",
      sessionId: input.sessionId,
      toolCall: active,
    });
    return active;
  }

  function finish(result: ContextCompactionResult & { id?: string }) {
    const toolCall = active ?? start(result);
    active = null;
    input.emit({
      type: "tool.finished",
      sessionId: input.sessionId,
      toolCall: finishContextCompactionToolCall(toolCall, result),
    });
  }

  return {
    start,
    finish,
    isActive: () => active !== null,
    abandon() {
      if (active) {
        finish({ status: "failed" });
      }
    },
  };
}
