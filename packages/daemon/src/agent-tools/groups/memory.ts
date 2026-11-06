import type {
  AgentToolCallerContext,
  MemoryEntry,
  MemoryRecallResult,
  MemoryRememberInput,
  MemoryRememberResult,
} from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";

export type MemoryWriteTarget = "assistant" | "user";

export interface MemoryToolDependencies {
  isEnabled(): boolean;
  recall(
    input: { query: string; limit?: number },
    caller: AgentToolCallerContext,
  ): Promise<MemoryRecallResult>;
  show(id: string, caller: AgentToolCallerContext): Promise<MemoryEntry | null>;
  remember(
    input: MemoryRememberInput,
    caller: AgentToolCallerContext,
    target: MemoryWriteTarget,
  ): Promise<MemoryRememberResult>;
  policy(caller: AgentToolCallerContext): Promise<string>;
  noteToolUse?(sessionId: string, tool: "recall" | "show" | "remember"): void;
}

const canRead = (caller: AgentToolCallerContext) =>
  caller.sessionKind !== "subagent";

const canWrite = (caller: AgentToolCallerContext) =>
  caller.sessionKind === "main" ||
  caller.sessionKind === "teammate" ||
  caller.sessionKind === "personal";

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
        "Search long-term memory through Respire (rsrs). Personal assistants search their own partition and shared about-me facts; other agent sessions search user-wide memory. Returns compact ids and titles; use memory_show before relying on an entry. Query with concrete keywords, not pronouns. Empty results are normal. A non-null error signals unavailable or incomplete recall; relay it instead of treating it as an empty store.",
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
      return deps.recall(
        {
          query: String(input.query),
          limit: optionalNumber(input.limit),
        },
        caller,
      );
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
      return deps.show(String(input.id), caller);
    },
  });

  registry.register({
    descriptor: {
      group: "memory",
      name: "remember",
      description:
        "Store one reusable fact, decision, lesson, or procedure in long-term memory. Recall first and prefer update/merge/attach over a new entry. important = a future session must reuse it; trivial = a diary line. Never store passwords, API tokens, private keys, or other secrets. If the result reports candidates, read them and choose merge/attach instead of forcing a new entry. If the action is skipped, its message names the fix (install rsrs, turn memory on, or register an rsrs account); relay it to the user instead of retrying.",
      inputSchema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description:
              "The memory body. For a personal fact or preference, state it plainly with its source and date when relevant. For a reusable procedure, include cause, action and result.",
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
          about: {
            type: "string",
            enum: ["assistant", "user"],
            description:
              "Personal assistant sessions only: user = a fact about the user that every assistant should share; assistant (default) = this assistant's own memory. Ignored elsewhere.",
          },
        },
        required: ["content", "title"],
        additionalProperties: false,
      },
    },
    isAvailable: (caller) => deps.isEnabled() && canWrite(caller),
    execute: async (caller, input) => {
      const target: MemoryWriteTarget =
        input.about === "user" ? "user" : "assistant";
      const result = await deps.remember(
        {
          content: String(input.content),
          title: String(input.title),
          importance:
            input.importance === "important" ? "important" : "trivial",
          tags: stringArray(input.tags),
          parentId: optionalString(input.parentId) ?? null,
          type: optionalString(input.type) ?? null,
          force: input.force === true,
          mergeIds: stringArray(input.mergeIds),
          supersedes: stringArray(input.supersedes),
          seeAlso: stringArray(input.seeAlso),
        },
        caller,
        target,
      );
      if (
        (result.action === "created" || result.action === "merged") &&
        result.id
      ) {
        deps.noteToolUse?.(caller.sessionId, "remember");
      }
      return result;
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
    execute: async (caller) => deps.policy(caller),
  });
}
