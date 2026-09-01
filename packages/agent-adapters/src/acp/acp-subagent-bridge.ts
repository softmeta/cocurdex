import type { SessionNotification, StopReason } from "@agentclientprotocol/sdk";
import type {
  AgentEvent,
  AgentToolCallRecord,
  SessionRecord,
} from "@cocurdex/shared";

export interface AcpSubagentSpawn {
  kind: "spawn";
  providerSessionId: string | null;
  status?: "completed" | "failed" | null;
  type: string | null;
  description: string;
}

export interface AcpSubagentSettlement {
  kind: "settlement";
  results: Array<{
    providerSessionId: string;
    status: "completed" | "failed" | "in_progress";
  }>;
}

export interface AcpSubagentLink {
  providerSessionId: string;
  type: string | null;
  description: string;
}

export interface AcpSubagentTurnCompletion {
  providerSessionId: string;
  stopReason: StopReason;
  durationMs: number;
}

export interface AcpSubagentProtocol {
  notificationMethods?: string[];
  replayLinkedSession?: boolean;
  inspect(
    toolCall: AgentToolCallRecord,
  ): AcpSubagentSpawn | AcpSubagentSettlement | null;
  inspectNotification?(
    method: string,
    params: unknown,
  ): AcpSubagentLink | AcpSubagentSettlement | null;
  mapSessionNotification?(
    method: string,
    params: unknown,
  ): SessionNotification | null;
  readTurnCompletion?(
    method: string,
    params: unknown,
  ): AcpSubagentTurnCompletion | null;
}

interface SpawnState {
  childSession: SessionRecord;
  providerSessionId: string | null;
  toolCall: AgentToolCallRecord;
}

function mapSettledToolStatus(
  status: AcpSubagentSettlement["results"][number]["status"],
): AgentToolCallRecord["status"] {
  if (status === "failed") {
    return "failed";
  }
  if (status === "completed") {
    return "completed";
  }
  return "in_progress";
}

function mapChildSessionStatus(
  status: AgentToolCallRecord["status"],
): SessionRecord["status"] {
  if (status === "failed") {
    return "error";
  }
  if (status === "completed") {
    return "idle";
  }
  return "running";
}

function projectSpawnStatus(
  existingStatus: AgentToolCallRecord["status"] | undefined,
  incomingStatus: AgentToolCallRecord["status"],
  signalStatus: AcpSubagentSpawn["status"],
) {
  if (existingStatus === "completed" || existingStatus === "failed") {
    return existingStatus;
  }
  if (signalStatus === "completed" || signalStatus === "failed") {
    return signalStatus;
  }
  if (incomingStatus === "failed") {
    return "failed" as const;
  }
  return "in_progress" as const;
}

export class AcpSubagentBridge {
  private readonly bufferedNotifications = new Map<
    string,
    SessionNotification[]
  >();
  private readonly providerToSpawn = new Map<string, SpawnState>();
  private readonly spawnsByToolCallId = new Map<string, SpawnState>();

  constructor(
    private readonly parentSession: SessionRecord,
    private readonly protocol: AcpSubagentProtocol,
    private readonly onEvent: (event: AgentEvent) => void,
    private readonly onLinked: (
      providerSessionId: string,
      childSession: SessionRecord,
      notifications: SessionNotification[],
    ) => void,
    private readonly onSettled?: (providerSessionId: string) => void,
  ) {}

  getChildSession(providerSessionId: string) {
    return this.providerToSpawn.get(providerSessionId)?.childSession ?? null;
  }

  buffer(notification: SessionNotification) {
    const current =
      this.bufferedNotifications.get(notification.sessionId) ?? [];
    current.push(notification);
    this.bufferedNotifications.set(notification.sessionId, current);
  }

  handleNotification(method: string, params: unknown) {
    const signal = this.protocol.inspectNotification?.(method, params);
    if (!signal) {
      return;
    }
    if ("kind" in signal) {
      this.settle(signal);
      return;
    }
    this.linkSpawn(signal);
  }

  mapSessionNotification(method: string, params: unknown) {
    return this.protocol.mapSessionNotification?.(method, params) ?? null;
  }

  readTurnCompletion(method: string, params: unknown) {
    return this.protocol.readTurnCompletion?.(method, params) ?? null;
  }

  linkSpawn(signal: AcpSubagentLink) {
    const state = [...this.spawnsByToolCallId.values()].find(
      (candidate) =>
        !candidate.providerSessionId &&
        candidate.childSession.title === signal.description &&
        candidate.toolCall.subagent?.type === signal.type,
    );
    if (!state) {
      return;
    }
    const nextState = { ...state, providerSessionId: signal.providerSessionId };
    this.spawnsByToolCallId.set(state.toolCall.id, nextState);
    this.link(signal.providerSessionId, nextState);
  }

  transform(toolCall: AgentToolCallRecord): AgentToolCallRecord | null {
    const signal = this.protocol.inspect(toolCall);
    if (!signal) {
      return toolCall;
    }

    if (signal.kind === "settlement") {
      this.settle(signal);
      return null;
    }

    return this.upsertSpawn(toolCall, signal);
  }

  private upsertSpawn(toolCall: AgentToolCallRecord, signal: AcpSubagentSpawn) {
    const existing = this.spawnsByToolCallId.get(toolCall.id);
    const childSessionId =
      existing?.childSession.id ??
      `acp-subagent:${this.parentSession.id}:${toolCall.id}`;
    const status = projectSpawnStatus(
      existing?.toolCall.status,
      toolCall.status,
      signal.status,
    );
    const projectedToolCall: AgentToolCallRecord = {
      ...toolCall,
      status,
      subagent: {
        sessionId: childSessionId,
        type: signal.type,
        description: signal.description,
      },
    };
    const childSession: SessionRecord = {
      ...this.parentSession,
      id: childSessionId,
      title: signal.description,
      sessionKind: "subagent",
      parentSessionId: this.parentSession.id,
      parentToolCallId: toolCall.id,
      status: mapChildSessionStatus(status),
      createdAt: existing?.childSession.createdAt ?? toolCall.startedAt,
      updatedAt: toolCall.updatedAt,
      lastMessageAt: existing?.childSession.lastMessageAt ?? null,
      archivedAt: null,
    };
    const state: SpawnState = {
      childSession,
      providerSessionId:
        signal.providerSessionId ?? existing?.providerSessionId ?? null,
      toolCall: projectedToolCall,
    };

    this.spawnsByToolCallId.set(toolCall.id, state);
    this.onEvent({
      type: "session.upserted",
      sessionId: childSession.id,
      session: childSession,
    });
    if (state.providerSessionId) {
      this.link(state.providerSessionId, state);
      if (
        state.toolCall.status === "completed" ||
        state.toolCall.status === "failed"
      ) {
        this.onSettled?.(state.providerSessionId);
      }
    }
    return projectedToolCall;
  }

  private link(providerSessionId: string, state: SpawnState) {
    const wasLinked = this.providerToSpawn.has(providerSessionId);
    this.providerToSpawn.set(providerSessionId, state);
    const notifications =
      this.bufferedNotifications.get(providerSessionId) ?? [];
    this.bufferedNotifications.delete(providerSessionId);
    if (!wasLinked || notifications.length > 0) {
      this.onLinked(providerSessionId, state.childSession, notifications);
    }
  }

  private settle(signal: AcpSubagentSettlement) {
    for (const result of signal.results) {
      const state = this.providerToSpawn.get(result.providerSessionId);
      if (!state) {
        continue;
      }
      const status = mapSettledToolStatus(result.status);
      const updatedAt = new Date().toISOString();
      const toolCall: AgentToolCallRecord = {
        ...state.toolCall,
        status,
        updatedAt,
      };
      const childSession: SessionRecord = {
        ...state.childSession,
        status: mapChildSessionStatus(status),
        updatedAt,
      };
      const nextState = { ...state, childSession, toolCall };
      this.providerToSpawn.set(result.providerSessionId, nextState);
      this.spawnsByToolCallId.set(toolCall.id, nextState);
      this.onEvent({
        type: "session.upserted",
        sessionId: childSession.id,
        session: childSession,
      });
      this.onEvent({
        type:
          status === "completed" || status === "failed"
            ? "tool.finished"
            : "tool.updated",
        sessionId: this.parentSession.id,
        toolCall,
      });
      this.onSettled?.(result.providerSessionId);
    }
  }
}
