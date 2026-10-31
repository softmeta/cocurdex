import type {
  AgentToolCallerContext,
  MemoryEntry,
  MemoryRecallResult,
  MemoryRememberInput,
  MemoryRememberResult,
} from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";

export interface MemoryToolDependencies {
  isEnabled(): boolean;
  recall(input: { query: string; limit?: number }): Promise<MemoryRecallResult>;
  show(id: string): Promise<MemoryEntry | null>;
  remember(input: MemoryRememberInput): Promise<MemoryRememberResult>;
  policy(): Promise<string>;
  noteToolUse?(sessionId: string, tool: "recall" | "show" | "remember"): void;
}

const canRead = (caller: AgentToolCallerContext) =>
  caller.sessionKind !== "subagent";

const canWrite = (caller: AgentToolCallerContext) =>
  caller.sessionKind === "main" || caller.sessionKind === "teammate";

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;
}

export function registerMemoryTools(
  registry: AgentToolRegistry,
  deps: MemoryToolDependencies,
) {
  registry.register({
    descriptor: {
      group: "memory",
      name: "recall",
      description:
        "Search the user's long-term memory through Respire (rsrs). Returns compact ids and titles; use memory_show to read a full entry before relying on it. Memory is shared across every project, so query with concrete keywords and the name of the thing you are looking for, not pronouns. Empty results are normal; try different terms before concluding there is no memory.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Concrete keywords" },
          limit: {
            type: "integer",
            description: "Maximum results, 1-20 (default 8)",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => deps.isEnabled() && canRead(caller),
    execute: async (caller, input) => {
      deps.noteToolUse?.(caller.sessionId, "recall");
      return deps.recall({
        query: String(input.query),
        limit: optionalNumber(input.limit),
      });
    },
  });

  registry.register({
    descriptor: {
      group: "memory",
      name: "show",
      description:
        "Read one long-term memory entry in full by id. Use it after memory_recall before making decisions or quoting the memory.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Memory id from memory_recall" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => deps.isEnabled() && canRead(caller),
    execute: async (caller, input) => {
      deps.noteToolUse?.(caller.sessionId, "show");
      return deps.show(String(input.id));
    },
  });

  registry.register({
    descriptor: {
      group: "memory",
      name: "remember",
      description:
        "Store one reusable fact, decision, lesson, or procedure in long-term memory. Recall first and prefer update/merge/attach over a new entry. important = a future session must reuse it; trivial = a diary line. Never store passwords, API tokens, private keys, or other secrets. If the result reports candidates, read them and choose merge/attach instead of forcing a new entry.",
      inputSchema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "The memory body. For important entries use three lines starting with 【前因】【行为】【后果】.",
          },
          title: {
            type: "string",
            description: "Short, specific title (12-24 characters)",
          },
          importance: {
            type: "string",
            enum: ["important", "trivial"],
            description:
              "important only when a future session must reuse it; otherwise trivial",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional tags",
          },
          parentId: {
            type: "string",
            description: "Attach under this cause/parent memory id",
          },
          type: {
            type: "string",
            description:
              "Memory type: context, decision, preference, task, emotion, time, or skill",
          },
          force: {
            type: "boolean",
            description:
              "Skip judge-then-store. Only after a dedup recall found nothing and no merge/attach candidate fits.",
          },
          mergeIds: {
            type: "array",
            items: { type: "string" },
            description: "Merge these old ids into the new combined entry",
          },
          supersedes: {
            type: "array",
            items: { type: "string" },
            description: "Live important memories this new conclusion replaces",
          },
          seeAlso: {
            type: "array",
            items: { type: "string" },
            description: "Bidirectional links to related live memories",
          },
        },
        required: ["content", "title"],
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => deps.isEnabled() && canWrite(caller),
    execute: async (caller, input) => {
      deps.noteToolUse?.(caller.sessionId, "remember");
      return deps.remember({
        content: String(input.content),
        title: String(input.title),
        importance: input.importance === "important" ? "important" : "trivial",
        tags: stringArray(input.tags),
        parentId: optionalString(input.parentId) ?? null,
        type: optionalString(input.type) ?? null,
        force: input.force === true,
        mergeIds: stringArray(input.mergeIds),
        supersedes: stringArray(input.supersedes),
        seeAlso: stringArray(input.seeAlso),
      });
    },
  });

  registry.register({
    descriptor: {
      group: "memory",
      name: "policy",
      description:
        "Read the full Respire (rsrs) memory workflow: dedup, tree placement, importance tiers, diary rules, and maintenance. The session memory gates are already in your instructions; read this when that decision is still unclear.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => deps.isEnabled() && canRead(caller),
    execute: async () => deps.policy(),
  });
}
