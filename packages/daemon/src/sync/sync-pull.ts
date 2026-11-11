import type { SyncClock, SyncTombstone } from "@cocurdex/db";
import type {
  AgentSessionPlan,
  AgentToolCallRecord,
  AgentTurnCompletedEvent,
  MessageRecord,
  SessionInteractionSnapshot,
  SessionRecord,
  SessionTranscriptPage,
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
  readTranscriptWindow(
    sessionId: string,
    beforeSeq: number | null,
  ): Promise<SessionTranscriptPage>;
  listMessagesChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<MessageRecord[]>;
  listActiveMessages(sessionId: string): MessageRecord[];
  listToolCallsChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<AgentToolCallRecord[]>;
  listTurnStatsChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<Record<string, AgentTurnCompletedEvent>>;
  listTurnChangeSetsChangedSince(
    sessionId: string,
    changeSeq: number,
  ): Promise<Record<string, TurnChangeSet>>;
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
  const page = await sources.readTranscriptWindow(sessionId, null);
  return {
    complete: true,
    messages: page.messages,
    deletedMessageIds: [],
    activeMessages: sources.listActiveMessages(sessionId),
    turnStats: page.turnStats,
    turnChangeSets: page.turnChangeSets,
    deletedTurnChangeSetIds: [],
    toolCalls: page.toolCalls,
    plan: sources.getPlan(sessionId),
    olderBeforeSeq: page.olderBeforeSeq,
  };
}

function deletedIds(
  tombstones: SyncTombstone[],
  entity: SyncTombstone["entity"],
  present: ReadonlySet<string>,
) {
  return tombstones
    .filter(
      (tombstone) =>
        tombstone.entity === entity && !present.has(tombstone.entityId),
    )
    .map((tombstone) => tombstone.entityId);
}

async function transcriptChanges(
  sources: SyncPullSources,
  sessionId: string,
  since: number,
  tombstones: SyncTombstone[],
): Promise<SessionTranscriptSync> {
  const [messages, toolCalls, turnStats, turnChangeSets] = await Promise.all([
    sources.listMessagesChangedSince(sessionId, since),
    sources.listToolCallsChangedSince(sessionId, since),
    sources.listTurnStatsChangedSince(sessionId, since),
    sources.listTurnChangeSetsChangedSince(sessionId, since),
  ]);
  const sessionTombstones = tombstones.filter(
    (tombstone) => tombstone.sessionId === sessionId,
  );
  const presentChangeSets = new Set(
    Object.values(turnChangeSets).map((changeSet) => changeSet.id),
  );
  return {
    complete: false,
    messages,
    deletedMessageIds: deletedIds(
      sessionTombstones,
      "message",
      new Set(messages.map((message) => message.id)),
    ),
    activeMessages: sources.listActiveMessages(sessionId),
    turnStats,
    turnChangeSets,
    deletedTurnChangeSetIds: deletedIds(
      sessionTombstones,
      "turnChangeSet",
      presentChangeSets,
    ),
    toolCalls,
    plan: sources.getPlan(sessionId),
    olderBeforeSeq: null,
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
