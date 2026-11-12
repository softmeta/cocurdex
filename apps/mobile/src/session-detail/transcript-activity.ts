import {
  summarizeToolActions,
  type ToolActionSummary,
} from "@cocurdex/client-runtime";
import type { AgentToolCallRecord } from "@cocurdex/shared";
import type { TranscriptItem } from "./transcript";

type UserItem = Extract<TranscriptItem, { kind: "user" }>;
type AssistantItem = Extract<TranscriptItem, { kind: "assistant" }>;
type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;
export type ActivityChild = AssistantItem | ToolItem;

export type LivePhase = "working" | "thinking" | "responding";

export interface TurnEnd {
  durationMs: number | null;
  stopped: boolean;
}

export type CondensedItem =
  | (UserItem & { separatorTime?: number })
  | (AssistantItem & {
      turnEnd: boolean;
      turn?: TurnEnd;
      separatorTime?: number;
    })
  | ToolItem
  | {
      kind: "activity";
      id: string;
      items: ActivityChild[];
      summary: ToolActionSummary;
      replies: number;
      running?: boolean;
      phase?: LivePhase;
      startedAt?: number;
    };

export interface LiveRun {
  running: boolean;
  phase: LivePhase;
  startedAt?: number;
}

type Turn = { prompt: UserItem | null; items: ActivityChild[] };

function splitTurns(items: readonly TranscriptItem[]) {
  const turns: Turn[] = [];
  let current: Turn = { prompt: null, items: [] };
  for (const item of items) {
    if (item.kind === "user") {
      if (current.prompt || current.items.length > 0) turns.push(current);
      current = { prompt: item, items: [] };
    } else if (item.kind === "assistant" && item.source) {
      if (current.prompt || current.items.length > 0) turns.push(current);
      turns.push({ prompt: null, items: [item] });
      current = { prompt: null, items: [] };
    } else {
      current.items.push(item);
    }
  }
  if (current.prompt || current.items.length > 0) turns.push(current);
  return turns;
}

function moveTrailingWorkBeforeAnswer(
  items: ActivityChild[],
  answerId: string | null,
) {
  const answerIndex = items.findIndex((item) => item.id === answerId);
  if (answerIndex < 0) return items;
  const trailing = items.slice(answerIndex + 1);
  const isFoldable = (item: ActivityChild) =>
    item.kind === "tool" && item.status === "completed";
  const folded = trailing.filter(isFoldable);
  if (folded.length === 0) return items;
  return [
    ...items.slice(0, answerIndex),
    ...folded,
    items[answerIndex],
    ...trailing.filter((item) => !isFoldable(item)),
  ];
}

function activity(
  run: ActivityChild[],
  records: ReadonlyMap<string, AgentToolCallRecord>,
): CondensedItem[] {
  const [first] = run;
  if (!first) return [];
  if (run.length === 1 && first.kind === "tool") return [first];
  const calls = run.flatMap((item) => {
    const call = item.kind === "tool" ? records.get(item.id) : undefined;
    return call ? [call] : [];
  });
  return [
    {
      kind: "activity",
      id: `activity:${first.id}`,
      items: run,
      summary: summarizeToolActions(calls),
      replies: run.filter((item) => item.kind === "assistant").length,
    },
  ];
}

function condenseTurn(
  turn: Turn,
  live: LiveRun | null,
  records: ReadonlyMap<string, AgentToolCallRecord>,
): CondensedItem[] {
  if (live) {
    const tools = turn.items.filter((item) => item.kind === "tool");
    const calls = tools.flatMap((item) => {
      const call = records.get(item.id);
      return call ? [call] : [];
    });
    return [
      ...(turn.prompt ? [turn.prompt] : []),
      {
        kind: "activity",
        id: `activity:${turn.prompt?.id ?? "active"}`,
        items: tools,
        summary: summarizeToolActions(calls),
        replies: 0,
        running: true,
        phase: live.phase,
        ...(live.startedAt === undefined ? {} : { startedAt: live.startedAt }),
      },
      ...turn.items.flatMap((item) =>
        item.kind === "assistant" ? [{ ...item, turnEnd: false }] : [],
      ),
    ];
  }
  const answerId =
    turn.items.findLast((item) => item.kind === "assistant")?.id ?? null;
  const ordered = moveTrailingWorkBeforeAnswer(turn.items, answerId);
  const isProcess = (item: ActivityChild) =>
    item.kind === "tool" || item.id !== answerId;
  const result: CondensedItem[] = turn.prompt ? [turn.prompt] : [];
  let run: ActivityChild[] = [];
  for (const item of ordered) {
    if (isProcess(item)) {
      run.push(item);
      continue;
    }
    result.push(...activity(run, records));
    run = [];
    result.push(
      item.kind === "assistant"
        ? { ...item, turnEnd: item.id === answerId }
        : item,
    );
  }
  result.push(...activity(run, records));
  return result;
}

export function condenseTranscript(
  items: readonly TranscriptItem[],
  toolCalls: readonly AgentToolCallRecord[],
  live?: LiveRun,
): CondensedItem[] {
  const records = new Map(toolCalls.map((call) => [call.id, call]));
  const turns = splitTurns(items);
  return turns.flatMap((turn, index) =>
    condenseTurn(
      turn,
      live?.running && index === turns.length - 1 ? live : null,
      records,
    ),
  );
}
