import type { CondensedItem } from "./transcript-activity";

export interface TranscriptTurn {
  id: string;
  items: CondensedItem[];
}

export function transcriptTurns(
  items: readonly CondensedItem[],
): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  for (const item of items) {
    const previous = turns.at(-1);
    if (item.kind === "user" || !previous) {
      turns.push({ id: item.id, items: [item] });
    } else {
      previous.items.push(item);
    }
  }
  return turns;
}
