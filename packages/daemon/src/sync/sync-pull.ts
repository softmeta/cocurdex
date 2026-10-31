import type { SyncClock, SyncTombstone } from "@cocurdex/db";
import type {
  AgentSessionPlan,
  AgentToolCallRecord,
  AgentTurnCompletedEvent,
  MessageRecord,
  SessionInteractionSnapshot,
  SessionRecord,
  SessionTranscriptSync,
  StoredBootstrapData,
  StoredSyncPullResult,
  SyncPullInput,
  TurnChangeSet,
} from "@cocurdex/shared";
import { formatSyncCursor, resolveSyncCursor } from "./sync-cursor";

export interface SyncPullSources {
  readClock(): SyncClock;
  bootstrap(): Promise<StoredBootstrapData>;
  listSessionsChangedSince(changeSeq: number): Promise<SessionRecord[]>;
  listTombstonesSince(changeSeq: number): SyncTombstone[];
  listMessages(sessionId: string): Promise<MessageRecord[]>;
  listMessagesChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<MessageRecord[]>;
  listActiveMessages(sessionId: string): MessageRecord[];
  listToolCalls(sessionId: string): Promise<AgentToolCallRecord[]>;
  listToolCallsChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<AgentToolCallRecord[]>;
  listTurnStats(
    sessionId: string,
  ): Promise<Record<string, AgentTurnCompletedEvent>>;
  listTurnStatsChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<Record<string, AgentTurnCompletedEvent>>;
  listTurnChangeSets(sessionId: string): Promise<Record<string, TurnChangeSet>>;
  hasTurnChangeSetsChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<boolean>;
  getPlan(sessionId: string): AgentSessionPlan | null;
  getInteractions(): SessionInteractionSnapshot;
}

export interface SyncPullPosition {
  epoch: string;
  eventSeq: number;
}

async function fullTranscript(
  sources: SyncPullSources,
  sessionId: string,
): Promise<SessionTranscriptSync> {
  const [messages, toolCalls, turnStats, turnChangeSets] = await Promise.all([
    sources.listMessages(sessionId),
    sources.listToolCalls(sessionId),
    sources.listTurnStats(sessionId),
    sources.listTurnChangeSets(sessionId),
  ]);
  return {
    complete: true,
    messages,
    deletedMessageIds: [],
    activeMessages: sources.listActiveMessages(sessionId),
    turnStats,
    turnChangeSets,
    toolCalls,
    plan: sources.getPlan(sessionId),
  };
}

async function transcriptChanges(
  sources: SyncPullSources,
  sessionId: string,
  since: number,
  tombstones: SyncTombstone[],
): Promise<SessionTranscriptSync> {
  const [messages, toolCalls, turnStats, turnChangeSetsChanged] =
    await Promise.all([
      sources.listMessagesChangedSince(sessionId, since),
      sources.listToolCallsChangedSince(sessionId, since),
      sources.listTurnStatsChangedSince(sessionId, since),
      sources.hasTurnChangeSetsChangedSince(sessionId, since),
    ]);
  const present = new Set(messages.map((message) => message.id));
  const sessionTombstones = tombstones.filter(
    (tombstone) => tombstone.sessionId === sessionId,
  );
  const deletedMessageIds = sessionTombstones
    .filter(
      (tombstone) =>
        tombstone.entity === "message" && !present.has(tombstone.entityId),
    )
    .map((tombstone) => tombstone.entityId);
  const reloadChangeSets =
    turnChangeSetsChanged ||
    sessionTombstones.some((tombstone) => tombstone.entity === "turnChangeSet");
  return {
    complete: false,
    messages,
    deletedMessageIds,
    activeMessages: sources.listActiveMessages(sessionId),
    turnStats,
    turnChangeSets: reloadChangeSets
      ? await sources.listTurnChangeSets(sessionId)
      : null,
    toolCalls,
    plan: sources.getPlan(sessionId),
  };
}

export async function pullSync(
  sources: SyncPullSources,
  position: SyncPullPosition,
  input: SyncPullInput,
): Promise<StoredSyncPullResult> {
  const clock = sources.readClock();
  const since = resolveSyncCursor(input.cursor, clock);
  const data = await sources.bootstrap();
  const shared = {
    cursor: formatSyncCursor(clock),
    epoch: position.epoch,
    eventSeq: position.eventSeq,
    queuedAgentInputs: data.queuedAgentInputs,
    queuedMessages: data.queuedMessages,
    activeRuns: data.activeRuns,
    sessionUsage: data.sessionUsage,
    interactions: sources.getInteractions(),
  };

  if (since === null) {
    const transcripts = await Promise.all(
      input.sessionIds.map(
        async (sessionId) =>
          [sessionId, await fullTranscript(sources, sessionId)] as const,
      ),
    );
    return {
      ...shared,
      mode: "full",
      sessions: data.sessions,
      removedSessionIds: [],
      transcripts: Object.fromEntries(transcripts),
    };
  }

  const tombstones = sources.listTombstonesSince(since);
  const sessions = await sources.listSessionsChangedSince(since);
  const presentSessions = new Set(sessions.map((session) => session.id));
  const removedSessionIds = tombstones
    .filter(
      (tombstone) =>
        tombstone.entity === "session" &&
        !presentSessions.has(tombstone.entityId),
    )
    .map((tombstone) => tombstone.entityId);
  const removed = new Set(removedSessionIds);
  const hydrated = new Set(input.hydratedSessionIds ?? []);
  const transcriptFor = (sessionId: string) => {
    if (removed.has(sessionId)) return null;
    return hydrated.has(sessionId)
      ? transcriptChanges(sources, sessionId, since, tombstones)
      : fullTranscript(sources, sessionId);
  };
  const transcripts = await Promise.all(
    input.sessionIds.map(
      async (sessionId) => [sessionId, await transcriptFor(sessionId)] as const,
    ),
  );
  return {
    ...shared,
    mode: "delta",
    sessions,
    removedSessionIds,
    transcripts: Object.fromEntries(transcripts),
  };
}
