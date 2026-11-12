import {
  conversationSeparatorTime,
  parseConversationTime,
} from "@cocurdex/client-runtime";
import type { TranscriptItem } from "./transcript";
import type { CondensedItem, LiveRun } from "./transcript-activity";

type Said = Extract<CondensedItem, { kind: "user" } | { kind: "assistant" }>;

export interface ConversationOptions {
  live: LiveRun;
  times: ReadonlyMap<string, string>;
  separators: boolean;
}

function startsExchange(item: Said, index: number) {
  return index === 0 || item.kind === "user" || item.source !== null;
}

function withSeparators(
  said: readonly Said[],
  times: ReadonlyMap<string, string>,
): Said[] {
  let previousEnd: number | null = null;
  return said.map((item, index) => {
    const time = parseConversationTime(times.get(item.id));
    const separatorTime = startsExchange(item, index)
      ? conversationSeparatorTime(previousEnd, time)
      : null;
    if (time !== null) previousEnd = time;
    return separatorTime === null ? item : { ...item, separatorTime };
  });
}

function markTurnEnds(said: readonly Said[], running: boolean): Said[] {
  return said.map((item, index) => {
    if (item.kind !== "assistant" || item.streaming) return item;
    const next = said[index + 1];
    const last = next === undefined;
    const turnEnd = last ? !running : startsExchange(next, index + 1);
    return turnEnd ? { ...item, turnEnd } : item;
  });
}

export function conversationTranscript(
  items: readonly TranscriptItem[],
  { live, times, separators }: ConversationOptions,
): CondensedItem[] {
  const spoken = items.flatMap((item): Said[] => {
    if (item.kind === "user") return [item];
    if (item.kind === "assistant") return [{ ...item, turnEnd: false }];
    return [];
  });
  const timed = separators ? withSeparators(spoken, times) : spoken;
  const said: CondensedItem[] = markTurnEnds(timed, live.running);
  const last = said.at(-1);
  const replying = last?.kind === "assistant" && last.streaming;
  if (!live.running || replying) return said;
  const working = items.filter(
    (item) =>
      item.kind === "tool" &&
      (item.status === "pending" || item.status === "in_progress"),
  );
  return [
    ...said,
    {
      kind: "activity",
      id: `activity:${last?.id ?? "active"}`,
      items: working.flatMap((item) => (item.kind === "tool" ? [item] : [])),
      summary: { actions: [], otherCount: 0 },
      replies: 0,
      running: true,
      phase: live.phase,
      ...(live.startedAt === undefined ? {} : { startedAt: live.startedAt }),
    },
  ];
}
