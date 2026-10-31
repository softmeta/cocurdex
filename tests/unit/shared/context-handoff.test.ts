import {
  buildContextHandoffText,
  contextHandoffBudget,
  type HandoffItem,
  selectHandoffItems,
  toolCallHandoffItem,
} from "@cocurdex/shared/internal/context-handoff";
import type { AgentToolCallRecord } from "@cocurdex/shared/internal/contracts";
import { describe, expect, it } from "vitest";

function item(
  id: string,
  role: HandoffItem["role"],
  text: string,
  kind: HandoffItem["kind"] = "message",
): HandoffItem {
  return {
    id,
    sessionId: "s1",
    position: null,
    role,
    kind,
    agent: role === "assistant" ? "codex" : null,
    text,
  };
}

function toolCall(
  overrides: Partial<AgentToolCallRecord>,
): AgentToolCallRecord {
  return {
    id: "t1",
    sessionId: "s1",
    title: "tool",
    status: "completed",
    content: [],
    locations: [],
    startedAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

const ids = (items: readonly HandoffItem[]) => items.map((entry) => entry.id);

describe("selectHandoffItems", () => {
  it("keeps the latest exchange and the opening request before older middle items", () => {
    const items = [
      item("u1", "user", "first request"),
      item("a1", "assistant", "a".repeat(200)),
      item("u2", "user", "b".repeat(200)),
      item("a2", "assistant", "c".repeat(200)),
      item("u3", "user", "latest request"),
      item("a3", "assistant", "latest answer"),
    ];
    const { selected, omittedCount } = selectHandoffItems(items, 200);
    expect(ids(selected)).toEqual(["u1", "u3", "a3"]);
    expect(omittedCount).toBe(3);
  });

  it("skips an oversized item whole and keeps filling with smaller older ones", () => {
    const items = [
      item("u1", "user", "short"),
      item("a1", "assistant", "short answer"),
      item("big", "assistant", "x".repeat(5_000), "command"),
      item("u2", "user", "latest"),
    ];
    const { selected } = selectHandoffItems(items, 400);
    expect(ids(selected)).toEqual(["u1", "a1", "u2"]);
    expect(selected.every((entry) => !entry.text.includes("…"))).toBe(true);
  });
});

describe("buildContextHandoffText", () => {
  it("reports coverage and how to read omitted history back", () => {
    const items = [
      item("u1", "user", "first"),
      item("a1", "assistant", "y".repeat(3_000)),
      item("u2", "user", "latest"),
    ];
    const { text, omittedCount } = buildContextHandoffText({
      transferKind: "agent_switch",
      strategy: "full",
      items,
      budget: 1_500,
      sessionId: "s1",
    });
    expect(omittedCount).toBe(1);
    expect(text).toContain("Selected 2 of 3 items intact; omitted 1.");
    expect(text).toContain('history_read, for example {"sessionId":"s1"');
    expect(text).toContain("[User · item=u2]\nlatest");
    expect(text).not.toContain("yyyy");
  });

  it("points forks at the source session for pre-fork tool activity", () => {
    const { text } = buildContextHandoffText({
      transferKind: "fork",
      strategy: "full",
      items: [],
      budget: 4_000,
      sessionId: "fork",
      sourceSessionId: "origin",
    });
    expect(text).toContain("belong to session origin");
  });
});

describe("contextHandoffBudget", () => {
  it("caps the budget on large windows", () => {
    expect(
      contextHandoffBudget({
        contextWindow: 1_000_000,
        currentText: "hi",
        currentAttachments: [],
      }),
    ).toBe(24_000);
  });

  it("shrinks with the room left after the reserve, usage, and the new input", () => {
    const budget = contextHandoffBudget({
      contextWindow: 40_000,
      nativeUsedTokens: 10_000,
      currentText: "z".repeat(1_000),
      currentAttachments: [
        { kind: "image", id: "i", name: "a.png", mimeType: "image/png" },
      ] as never,
    });
    expect(budget).toBe(40_000 - 10_000 - 1_000 - 8_192 - 16_000);
  });

  it("returns zero when the window is already full", () => {
    expect(
      contextHandoffBudget({
        contextWindow: 20_000,
        nativeUsedTokens: 19_000,
        currentText: "",
        currentAttachments: [],
      }),
    ).toBe(0);
  });
});

describe("toolCallHandoffItem", () => {
  it("renders commands with status, exit code, and the tail of the output", () => {
    const entry = toolCallHandoffItem(
      toolCall({
        kind: "exec",
        status: "failed",
        rawInput: { command: "pnpm test" },
        rawOutput: { exitCode: 1, stdout: `${"o".repeat(3_000)}FAIL` },
      }),
      "codex",
    );
    expect(entry?.kind).toBe("command");
    expect(entry?.text).toContain("Command: pnpm test\nStatus: failed");
    expect(entry?.text).toContain("Exit code: 1");
    expect(entry?.text).toContain("earlier characters omitted");
    expect(entry?.text.endsWith("FAIL")).toBe(true);
  });

  it("renders file changes by path", () => {
    const entry = toolCallHandoffItem(
      toolCall({
        kind: "edit",
        content: [{ type: "diff", path: "src/a.ts", newText: "x" }],
        locations: [{ path: "src/b.ts" }],
      }),
      "claude-agent",
    );
    expect(entry?.text).toBe("File change (completed): src/a.ts, src/b.ts");
  });

  it("drops successful reads and subagent calls", () => {
    expect(toolCallHandoffItem(toolCall({ kind: "read" }), null)).toBeNull();
    expect(
      toolCallHandoffItem(
        toolCall({
          kind: "exec",
          subagent: { sessionId: "c", type: null, description: "d" },
        }),
        null,
      ),
    ).toBeNull();
  });
});
