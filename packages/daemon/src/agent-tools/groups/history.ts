import type { AgentToolCallerContext, HandoffItem } from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";

export const HISTORY_READ_LIMITS = {
  defaultLimit: 20,
  maxLimit: 20,
  defaultCharsPerItem: 4_000,
  minCharsPerItem: 200,
  maxCharsPerItem: 4_000,
} as const;

export interface HistoryToolDependencies {
  readSessionActivity(
    caller: AgentToolCallerContext,
    sessionId: string,
  ): Promise<HandoffItem[]>;
}

export interface HistoryReadInput {
  afterPosition?: number;
  beforePosition?: number;
  limit?: number;
  maxCharsPerItem?: number;
  itemId?: string;
  textOffset?: number;
}

function clamp(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (value === undefined) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function itemMeta(item: HandoffItem) {
  return {
    itemId: item.id,
    position: item.position,
    role: item.role,
    kind: item.kind,
    agent: item.agent,
    ...(item.status ? { status: item.status } : {}),
  };
}

function readItemText(item: HandoffItem, offset: number, maxChars: number) {
  const text = item.text.slice(offset, offset + maxChars);
  const end = offset + text.length;
  return {
    ...itemMeta(item),
    text,
    textOffset: offset,
    textLength: item.text.length,
    nextTextOffset: end < item.text.length ? end : null,
  };
}

function pageWindow(
  items: readonly HandoffItem[],
  input: HistoryReadInput,
  limit: number,
) {
  const position = (item: HandoffItem) => item.position ?? 0;
  if (input.afterPosition !== undefined) {
    const after = input.afterPosition;
    const newer = items.filter((item) => position(item) > after);
    return newer.slice(0, limit);
  }
  const before = input.beforePosition;
  const older =
    before === undefined
      ? items
      : items.filter((item) => position(item) < before);
  return older.slice(Math.max(0, older.length - limit));
}

export function pageSessionActivity(
  items: readonly HandoffItem[],
  input: HistoryReadInput,
) {
  const limits = HISTORY_READ_LIMITS;
  const maxChars = clamp(
    input.maxCharsPerItem,
    limits.defaultCharsPerItem,
    limits.minCharsPerItem,
    limits.maxCharsPerItem,
  );
  if (input.itemId !== undefined) {
    const item = items.find((entry) => entry.id === input.itemId);
    if (!item) throw new Error(`Item ${input.itemId} is not in this history`);
    const offset = clamp(input.textOffset, 0, 0, item.text.length);
    return { item: readItemText(item, offset, maxChars) };
  }
  const limit = clamp(input.limit, limits.defaultLimit, 1, limits.maxLimit);
  const page = pageWindow(items, input, limit);
  const first = page[0]?.position ?? null;
  const last = page.at(-1)?.position ?? null;
  return {
    totalItems: items.length,
    items: page.map((item) => {
      const read = readItemText(item, 0, maxChars);
      return read.nextTextOffset === null ? read : { ...read, truncated: true };
    }),
    olderBeforePosition:
      first !== null && items.some((item) => (item.position ?? 0) < first)
        ? first
        : null,
    newerAfterPosition:
      last !== null && items.some((item) => (item.position ?? 0) > last)
        ? last
        : null,
  };
}

const isNotSubagent = (caller: AgentToolCallerContext) =>
  caller.sessionKind !== "subagent";

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

export function registerHistoryTools(
  registry: AgentToolRegistry,
  deps: HistoryToolDependencies,
) {
  registry.register({
    descriptor: {
      group: "history",
      name: "read",
      description:
        "Read this Cocurdex session's history: user and assistant messages, commands with their output, file changes, and failed tools, ordered by position. Use it to recover items a context handoff omitted or shortened. Without a position it returns the newest items; page backward with beforePosition (olderBeforePosition from the last result) or forward with afterPosition. Pass itemId (with textOffset from nextTextOffset) to read one long item in full. sessionId defaults to this session; a forked session may also read the session it was forked from, up to the fork point.",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: {
            type: "string",
            description: "Session to read; defaults to the calling session",
          },
          afterPosition: {
            type: "integer",
            description: "Return items after this position, oldest first",
          },
          beforePosition: {
            type: "integer",
            description: "Return the newest items before this position",
          },
          limit: {
            type: "integer",
            description: `Items per page, 1-${HISTORY_READ_LIMITS.maxLimit}`,
          },
          maxCharsPerItem: {
            type: "integer",
            description: `Characters of text per item, ${HISTORY_READ_LIMITS.minCharsPerItem}-${HISTORY_READ_LIMITS.maxCharsPerItem}`,
          },
          itemId: {
            type: "string",
            description: "Read the text of one item instead of a page",
          },
          textOffset: {
            type: "integer",
            description:
              "Character offset into the item's text when reading itemId",
          },
        },
        additionalProperties: false,
      },
    },
    isAvailable: isNotSubagent,
    execute: async (caller, input) => {
      const sessionId =
        typeof input.sessionId === "string"
          ? input.sessionId
          : caller.sessionId;
      const items = await deps.readSessionActivity(caller, sessionId);
      return {
        sessionId,
        ...pageSessionActivity(items, {
          afterPosition: optionalNumber(input.afterPosition),
          beforePosition: optionalNumber(input.beforePosition),
          limit: optionalNumber(input.limit),
          maxCharsPerItem: optionalNumber(input.maxCharsPerItem),
          itemId: typeof input.itemId === "string" ? input.itemId : undefined,
          textOffset: optionalNumber(input.textOffset),
        }),
      };
    },
  });
}
