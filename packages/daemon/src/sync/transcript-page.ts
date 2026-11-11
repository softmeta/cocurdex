import type { CocurdexDatabase } from "@cocurdex/db";
import type { MessageRecord, SessionTranscriptPage } from "@cocurdex/shared";
import { selectTranscriptWindow } from "./transcript-window";

export type TranscriptPageDatabase = Pick<
  CocurdexDatabase,
  "timeline" | "messages" | "toolCalls" | "messageTurnStats" | "turnChangeSets"
>;

export async function readTranscriptPage(
  database: TranscriptPageDatabase,
  sessionId: string,
  beforeSeq: number | null,
  settled: (messages: MessageRecord[]) => MessageRecord[] = (messages) =>
    messages,
): Promise<SessionTranscriptPage> {
  const window = selectTranscriptWindow(
    database.timeline.listEntrySizesNewestFirst(sessionId, beforeSeq),
    beforeSeq,
  );
  const [messages, toolCalls, turnStats, turnChangeSets] = await Promise.all([
    database.messages.listBySessionIdInSeqRange(sessionId, window.range),
    database.toolCalls.listSummariesInSeqRange(sessionId, window.range),
    database.messageTurnStats.listByMessageSeqRange(sessionId, window.range),
    database.turnChangeSets.listByUserMessageSeqRange(sessionId, window.range),
  ]);
  return {
    messages: settled(messages),
    toolCalls,
    turnStats,
    turnChangeSets,
    olderBeforeSeq: window.olderBeforeSeq,
  };
}
