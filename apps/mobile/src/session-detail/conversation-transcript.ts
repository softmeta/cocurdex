import type { TranscriptItem } from "./transcript";
import type { CondensedItem } from "./transcript-activity";

export function conversationTranscript(
  items: readonly TranscriptItem[],
  running: boolean,
): CondensedItem[] {
  const said = items.flatMap((item): CondensedItem[] => {
    if (item.kind === "user") return [item];
    if (item.kind === "assistant") return [{ ...item, turnEnd: false }];
    return [];
  });
  const last = said.at(-1);
  const replying = last?.kind === "assistant" && last.streaming;
  if (!running || replying) return said;
  return [
    ...said,
    {
      kind: "activity",
      id: `activity:${last?.id ?? "active"}`,
      items: [],
      summary: { actions: [], otherCount: 0 },
      replies: 0,
      running: true,
    },
  ];
}
