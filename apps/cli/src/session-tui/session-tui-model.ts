import type {
  AgentEvent,
  AgentPermissionRequestRecord,
  AgentPlanApprovalRecord,
  AgentQuestionRequestRecord,
  AgentToolCallRecord,
  AgentUsageRecord,
  MessageRecord,
  QueuedAgentInputRecord,
  SessionObservationSnapshot,
  SessionRecord,
} from "@cocurdex/shared";

type PlanProjection = Extract<AgentEvent, { type: "plan.updated" }>["plan"];
type RateLimitsProjection = Extract<
  AgentEvent,
  { type: "rate_limits.updated" }
>["rateLimits"];

export interface SessionTuiInteractions {
  permissions: AgentPermissionRequestRecord[];
  questions: AgentQuestionRequestRecord[];
  planApprovals: AgentPlanApprovalRecord[];
}

export interface SessionTuiState {
  session: SessionRecord;
  messages: MessageRecord[];
  toolCalls: AgentToolCallRecord[];
  queuedAgentInputs: QueuedAgentInputRecord[];
  usage: AgentUsageRecord | null;
  interactions: SessionTuiInteractions;
  plan: PlanProjection | null;
  rateLimits: RateLimitsProjection | null;
  lastError: string | null;
}

function upsertById<T extends { id: string }>(items: T[], value: T): T[] {
  const index = items.findIndex((item) => item.id === value.id);
  if (index < 0) {
    return [...items, value];
  }
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id);
}

function mergeSnapshotMessages(
  messages: MessageRecord[],
  activeMessages: MessageRecord[],
) {
  return activeMessages.reduce(upsertById, messages);
}

export function createSessionTuiState(
  snapshot: SessionObservationSnapshot,
): SessionTuiState {
  return {
    session: snapshot.session,
    messages: mergeSnapshotMessages(snapshot.messages, snapshot.activeMessages),
    toolCalls: snapshot.toolCalls,
    queuedAgentInputs: snapshot.queuedAgentInputs,
    usage: snapshot.usage,
    interactions: snapshot.interactions,
    plan: null,
    rateLimits: null,
    lastError: null,
  };
}

export function applySessionEvent(
  state: SessionTuiState,
  event: AgentEvent,
): SessionTuiState {
  if (event.sessionId !== state.session.id) {
    return state;
  }

  switch (event.type) {
    case "session.upserted":
      return { ...state, session: event.session };
    case "message.delta": {
      const current = state.messages.find(
        (message) => message.id === event.messageId,
      );
      const nextMessage: MessageRecord = {
        id: event.messageId,
        sessionId: event.sessionId,
        role: event.role,
        kind: event.kind,
        content: `${current?.content ?? ""}${event.delta}`,
        attachments: current?.attachments ?? [],
        createdAt: current?.createdAt ?? event.createdAt,
      };
      return {
        ...state,
        messages: upsertById(state.messages, nextMessage),
      };
    }
    case "message.completed":
      return {
        ...state,
        messages: upsertById(state.messages, event.message),
        lastError: null,
      };
    case "tool.started":
    case "tool.updated":
    case "tool.finished":
      return {
        ...state,
        toolCalls: upsertById(state.toolCalls, event.toolCall),
      };
    case "state.changed":
      return {
        ...state,
        session: { ...state.session, status: event.status },
      };
    case "permission.requested":
      return {
        ...state,
        interactions: {
          ...state.interactions,
          permissions: upsertById(
            state.interactions.permissions,
            event.request,
          ),
        },
      };
    case "permission.resolved":
      return {
        ...state,
        interactions: {
          ...state.interactions,
          permissions: removeById(
            state.interactions.permissions,
            event.request.id,
          ),
        },
      };
    case "question.requested":
      return {
        ...state,
        interactions: {
          ...state.interactions,
          questions: upsertById(state.interactions.questions, event.question),
        },
      };
    case "question.resolved":
      return {
        ...state,
        interactions: {
          ...state.interactions,
          questions: removeById(
            state.interactions.questions,
            event.question.id,
          ),
        },
      };
    case "plan.approval.requested":
      return {
        ...state,
        interactions: {
          ...state.interactions,
          planApprovals: upsertById(
            state.interactions.planApprovals,
            event.approval,
          ),
        },
      };
    case "plan.approval.resolved":
      return {
        ...state,
        interactions: {
          ...state.interactions,
          planApprovals: removeById(
            state.interactions.planApprovals,
            event.approval.id,
          ),
        },
      };
    case "plan.updated":
      return { ...state, plan: event.plan };
    case "usage.updated":
      return { ...state, usage: event.usage };
    case "rate_limits.updated":
      return { ...state, rateLimits: event.rateLimits };
    case "error":
      return { ...state, lastError: event.message };
    default:
      return state;
  }
}
