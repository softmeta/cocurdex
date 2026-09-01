import type { AgentToolCallRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  formatToolCallData,
  formatToolCallOutput,
  getSubagentChildSessionId,
  getSubagentDescription,
  getSubagentType,
  getToolCallInputEntries,
  getToolCallTitle,
  getToolCallTriggerParts,
  isMultilineInputField,
  isSubagentToolCall,
  partitionToolCallRuns,
} from "@/features/agent/tool-call/tool-call-utils";

function timedToolCall(startedAt: string, updatedAt: string) {
  return {
    id: `${startedAt}-${updatedAt}`,
    sessionId: "session-1",
    title: "read",
    kind: "read",
    status: "completed",
    rawInput: null,
    rawOutput: null,
    content: [],
    locations: [],
    startedAt,
    updatedAt,
  } satisfies AgentToolCallRecord;
}

function statusToolCall(
  status: AgentToolCallRecord["status"],
): AgentToolCallRecord {
  return {
    ...timedToolCall("2026-05-20T00:00:00.000Z", "2026-05-20T00:00:01.000Z"),
    id: `tool-${status}`,
    status,
  };
}

function subagentToolCall(
  status: AgentToolCallRecord["status"],
): AgentToolCallRecord {
  return {
    id: `task-${status}`,
    sessionId: "session-1",
    title: "Using subagent",
    kind: "other",
    status,
    subagent: {
      sessionId: "child-session-1",
      type: "code-reviewer",
      description: "Explore source",
    },
    rawInput: null,
    rawOutput: null,
    content: [],
    locations: [],
    startedAt: "2026-05-20T00:00:00.000Z",
    updatedAt: "2026-05-20T00:00:01.000Z",
  };
}

describe("tool call utils", () => {
  it("formats Pi text content output as plain text", () => {
    expect(
      formatToolCallData({
        content: [
          {
            type: "text",
            text: "total 40\n-rw-r--r-- index.ts\n",
          },
        ],
      }),
    ).toBe("total 40\n-rw-r--r-- index.ts\n");
  });

  it("keeps non-text structured output as JSON", () => {
    expect(formatToolCallData({ bytes: 123 })).toBe(
      JSON.stringify({ bytes: 123 }, null, 2),
    );
  });

  it("prefers user-facing tool content over raw byte output", () => {
    expect(
      formatToolCallOutput(
        [{ type: "text", text: "=== large source files ===\n42 files" }],
        {
          type: "Bash",
          output: [61, 61, 61, 32, 108, 97, 114, 103, 101],
        },
      ),
    ).toBe("=== large source files ===\n42 files");
  });

  it("renders exec command input full-width below its label", () => {
    const entries = getToolCallInputEntries({
      id: "bash-1",
      sessionId: "session-1",
      title: "bash",
      kind: "exec",
      status: "completed",
      content: [],
      rawInput: { command: "ls /Users/example/project/" },
      rawOutput: null,
      locations: [],
      startedAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:01.000Z",
    });

    expect(entries).not.toBeNull();
    const commandEntry = entries?.find((entry) => entry.key === "command");
    expect(commandEntry).toBeDefined();
    // A shell command is a code-like value that should stack full-width under
    // its label instead of sitting inline with a wide empty gutter.
    expect(commandEntry?.mono).toBe(true);
    expect(commandEntry && isMultilineInputField(commandEntry)).toBe(true);
  });

  it("keeps Grok terminal commands in the truncating row detail", () => {
    const command =
      'find apps packages -type f -name "*.ts" | sort -rn | head -40';
    const parts = getToolCallTriggerParts({
      id: "grok-command-1",
      sessionId: "session-1",
      title: `Execute ${command}`,
      kind: "execute",
      status: "in_progress",
      content: [],
      rawInput: { input: { command } },
      rawOutput: null,
      locations: [],
      startedAt: "2026-05-20T00:00:00.000Z",
      updatedAt: "2026-05-20T00:00:01.000Z",
    });

    expect(parts).toEqual({
      title: "Run",
      secondary: command,
    });
  });

  it("partitions tool calls into timeline-ordered runs", () => {
    const read = statusToolCall("completed");
    const first = subagentToolCall("in_progress");
    const second = {
      ...subagentToolCall("in_progress"),
      id: "task-second",
    };
    const grep = {
      ...statusToolCall("completed"),
      id: "tool-grep",
      kind: "grep",
    };

    expect(
      partitionToolCallRuns([read, first, second, grep]).map((run) => ({
        kind: run.kind,
        ids: run.toolCalls.map((toolCall) => toolCall.id),
      })),
    ).toEqual([
      { kind: "tool", ids: ["tool-completed"] },
      { kind: "subagent", ids: ["task-in_progress", "task-second"] },
      { kind: "tool", ids: ["tool-grep"] },
    ]);
  });

  it("reads provider-neutral subagent semantics", () => {
    const toolCall = subagentToolCall("in_progress");
    expect(isSubagentToolCall(toolCall)).toBe(true);
    expect(getSubagentChildSessionId(toolCall)).toBe("child-session-1");
    expect(getSubagentType(toolCall)).toBe("Code Reviewer");
    expect(getSubagentDescription(toolCall)).toBe("Explore source");
  });

  it("uses status-aware subagent titles", () => {
    expect(getToolCallTitle(subagentToolCall("in_progress"))).toBe(
      "Using subagent",
    );
    expect(getToolCallTitle(subagentToolCall("completed"))).toBe(
      "Subagent completed",
    );
    expect(getToolCallTitle(subagentToolCall("failed"))).toBe(
      "Subagent failed",
    );
  });
});
