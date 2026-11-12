import type {
  DelegationReportOutcome,
  MessageOrigin,
  MessageRecord,
} from "./contracts";

export interface DelegationSource {
  sessionId: string;
  title: string;
  outcome: DelegationReportOutcome | null;
}

export interface DelegationReportFold {
  hiddenMessageIds: ReadonlySet<string>;
  sourcesByReplyId: ReadonlyMap<string, readonly DelegationSource[]>;
  pendingByMessageId: ReadonlyMap<string, DelegationSource>;
}

type FoldableMessage = Pick<
  MessageRecord,
  "id" | "role" | "kind" | "content" | "origin"
>;

function reportSource(
  origin: MessageOrigin | null | undefined,
  personal: boolean,
): DelegationSource | null {
  if (origin?.kind === "delegation") {
    return {
      sessionId: origin.sessionId,
      title: origin.sessionTitle,
      outcome: origin.outcome,
    };
  }
  if (personal && origin?.kind === "peer") {
    return {
      sessionId: origin.sessionId,
      title: origin.sessionTitle,
      outcome: null,
    };
  }
  return null;
}

function isReply(message: FoldableMessage) {
  return (
    message.role === "assistant" &&
    message.kind !== "reasoning" &&
    !message.origin &&
    message.content.trim() !== ""
  );
}

export function foldDelegationReports(
  messages: readonly FoldableMessage[],
  options: { personal: boolean },
): DelegationReportFold {
  const hiddenMessageIds = new Set<string>();
  const sourcesByReplyId = new Map<string, DelegationSource[]>();
  let pending: { id: string; source: DelegationSource }[] = [];

  for (const message of messages) {
    const source =
      message.role === "user"
        ? reportSource(message.origin, options.personal)
        : null;
    if (source) {
      pending.push({ id: message.id, source });
      continue;
    }
    if (pending.length === 0 || !isReply(message)) continue;
    for (const entry of pending) hiddenMessageIds.add(entry.id);
    sourcesByReplyId.set(
      message.id,
      uniqueSources(pending.map((entry) => entry.source)),
    );
    pending = [];
  }

  return {
    hiddenMessageIds,
    sourcesByReplyId,
    pendingByMessageId: new Map(
      pending.map((entry) => [entry.id, entry.source]),
    ),
  };
}

function uniqueSources(sources: readonly DelegationSource[]) {
  const bySession = new Map<string, DelegationSource>();
  for (const source of sources) bySession.set(source.sessionId, source);
  return [...bySession.values()];
}
