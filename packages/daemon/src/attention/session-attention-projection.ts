import type {
  SessionAttentionRepository,
  SessionRepository,
  StoredSessionAttention,
} from "@cocurdex/db";
import type {
  AgentEvent,
  SessionAttentionSnapshot,
  SessionRecord,
  UpdateSessionAttentionPayload,
} from "@cocurdex/shared";
import { deriveSessionAttention } from "@cocurdex/shared";

function createDefaultAttention(
  session: SessionRecord,
): StoredSessionAttention {
  return {
    sessionId: session.id,
    activityKind: session.status === "running" ? "foreground" : null,
    connectionPending: false,
    latestResultAt: null,
    lastVisitedAt: null,
    resultDisposition: "automatic",
    updatedAt: session.updatedAt,
  };
}

function toSnapshot(
  session: SessionRecord,
  attention: StoredSessionAttention,
  pending: {
    permission: boolean;
    question: boolean;
    planApproval: boolean;
  },
): SessionAttentionSnapshot {
  const summary = deriveSessionAttention({
    sessionStatus: session.status,
    connectionPending: attention.connectionPending,
    activityKind: attention.activityKind,
    hasPendingPermission: pending.permission,
    hasPendingQuestion: pending.question,
    hasPendingPlanApproval: pending.planApproval,
    latestResultAt: attention.latestResultAt,
    lastVisitedAt: attention.lastVisitedAt,
    resultDisposition: attention.resultDisposition,
  });
  return {
    sessionId: session.id,
    activityKind: attention.activityKind,
    connectionPending: attention.connectionPending,
    latestResultAt: attention.latestResultAt,
    lastVisitedAt: attention.lastVisitedAt,
    resultDisposition: attention.resultDisposition,
    updatedAt: attention.updatedAt,
    ...summary,
  };
}

export class SessionAttentionProjection {
  // Pending interaction continuations live in AgentRuntimeManager promises.
  // A daemon restart invalidates those continuations, so these IDs must stay
  // process-local rather than reappear as actionable requests after restart.
  private readonly pendingPermissions = new Map<string, Set<string>>();
  private readonly pendingQuestions = new Map<string, Set<string>>();
  private readonly pendingPlanApprovals = new Map<string, Set<string>>();

  constructor(
    private readonly attention: SessionAttentionRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async list(): Promise<SessionAttentionSnapshot[]> {
    const [sessions, storedAttention] = await Promise.all([
      this.sessions.list(),
      this.attention.list(),
    ]);
    const attentionBySessionId = new Map(
      storedAttention.map((entry) => [entry.sessionId, entry]),
    );
    return sessions.map((session) =>
      toSnapshot(
        session,
        attentionBySessionId.get(session.id) ?? createDefaultAttention(session),
        this.getPendingFacts(session.id),
      ),
    );
  }

  async update(
    payload: UpdateSessionAttentionPayload,
  ): Promise<SessionAttentionSnapshot> {
    const session = await this.sessions.getById(payload.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${payload.sessionId}`);
    }
    const current =
      (await this.attention.getBySessionId(payload.sessionId)) ??
      createDefaultAttention(session);
    const next: StoredSessionAttention = {
      ...current,
      lastVisitedAt:
        payload.action === "visited" ? payload.at : current.lastVisitedAt,
      resultDisposition: this.resolveDisposition(payload.action),
      updatedAt: payload.at,
    };
    await this.attention.upsert(next);
    return toSnapshot(session, next, this.getPendingFacts(session.id));
  }

  async applyEvent(event: AgentEvent): Promise<void> {
    if (event.type === "permission.requested") {
      await this.recordNewActivity(event.sessionId, event.request.createdAt);
      this.addPending(
        this.pendingPermissions,
        event.sessionId,
        event.request.id,
      );
      return;
    }
    if (event.type === "permission.resolved") {
      this.removePending(
        this.pendingPermissions,
        event.sessionId,
        event.request.id,
      );
      return;
    }
    if (event.type === "question.requested") {
      await this.recordNewActivity(event.sessionId, event.question.createdAt);
      this.addPending(
        this.pendingQuestions,
        event.sessionId,
        event.question.id,
      );
      return;
    }
    if (event.type === "question.resolved") {
      this.removePending(
        this.pendingQuestions,
        event.sessionId,
        event.question.id,
      );
      return;
    }
    if (event.type === "plan.approval.requested") {
      await this.recordNewActivity(event.sessionId, event.approval.createdAt);
      this.addPending(
        this.pendingPlanApprovals,
        event.sessionId,
        event.approval.id,
      );
      return;
    }
    if (event.type === "plan.approval.resolved") {
      this.removePending(
        this.pendingPlanApprovals,
        event.sessionId,
        event.approval.id,
      );
      return;
    }
    if (
      event.type === "message.completed" &&
      event.message.role === "assistant"
    ) {
      const session = await this.sessions.getById(event.sessionId);
      if (!session) {
        return;
      }
      const current =
        (await this.attention.getBySessionId(event.sessionId)) ??
        createDefaultAttention(session);
      const isNewActivity =
        Date.parse(event.message.createdAt) >= Date.parse(current.updatedAt);
      await this.attention.upsert({
        ...current,
        activityKind: null,
        latestResultAt: event.message.createdAt,
        resultDisposition: isNewActivity
          ? "automatic"
          : current.resultDisposition,
        updatedAt: isNewActivity ? event.message.createdAt : current.updatedAt,
      });
    }
  }

  private async recordNewActivity(sessionId: string, at: string) {
    const session = await this.sessions.getById(sessionId);
    if (!session) {
      return;
    }
    const current =
      (await this.attention.getBySessionId(sessionId)) ??
      createDefaultAttention(session);
    if (Date.parse(at) < Date.parse(current.updatedAt)) {
      return;
    }
    await this.attention.upsert({
      ...current,
      resultDisposition: "automatic",
      updatedAt: at,
    });
  }

  private getPendingFacts(sessionId: string) {
    return {
      permission: (this.pendingPermissions.get(sessionId)?.size ?? 0) > 0,
      question: (this.pendingQuestions.get(sessionId)?.size ?? 0) > 0,
      planApproval: (this.pendingPlanApprovals.get(sessionId)?.size ?? 0) > 0,
    };
  }

  private addPending(
    target: Map<string, Set<string>>,
    sessionId: string,
    requestId: string,
  ) {
    const requestIds = target.get(sessionId) ?? new Set<string>();
    requestIds.add(requestId);
    target.set(sessionId, requestIds);
  }

  private removePending(
    target: Map<string, Set<string>>,
    sessionId: string,
    requestId: string,
  ) {
    const requestIds = target.get(sessionId);
    requestIds?.delete(requestId);
    if (requestIds?.size === 0) {
      target.delete(sessionId);
    }
  }

  private resolveDisposition(
    action: UpdateSessionAttentionPayload["action"],
  ): StoredSessionAttention["resultDisposition"] {
    switch (action) {
      case "mark-unread":
        return "unread";
      case "settle":
        return "settled";
      case "visited":
      case "unsettle":
        return "automatic";
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  }
}
