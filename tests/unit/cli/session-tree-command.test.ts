import { formatExecutionTree } from "@cocurdex/cli/internal/session-tree-command";
import type {
  ExecutionSessionNode,
  SessionExecutionTree,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function sessionNode(
  id: string,
  overrides: Partial<ExecutionSessionNode> = {},
): ExecutionSessionNode {
  return {
    session: {
      id,
      title: id,
      agentType: "codex",
      sessionKind: "main",
      status: "running",
      parentSessionId: null,
      parentToolCallId: null,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
    runs: [],
    toolCalls: [],
    children: [],
    interactions: [],
    plan: null,
    truncated: false,
    ...overrides,
  };
}

describe("formatExecutionTree", () => {
  it("renders runs, subagents, unobservable calls and cut-offs as an indented tree", () => {
    const tree: SessionExecutionTree = {
      maxDepth: 1,
      root: sessionNode("lead", {
        runs: [
          {
            run: {
              id: "r1",
              sessionId: "lead",
              triggerMessageId: "m1",
              status: "running",
              startedAt: "2026-10-01T00:00:00.000Z",
            },
            toolCalls: [
              {
                toolCall: {
                  id: "t1",
                  title: "Explore",
                  kind: "think",
                  status: "in_progress",
                  startedAt: "2026-10-01T00:00:00.000Z",
                  updatedAt: "2026-10-01T00:00:00.000Z",
                },
                subagent: { sessionId: "x", type: null, description: "scan" },
                child: null,
                observability: "limited",
              },
            ],
            delegated: [
              sessionNode("mate", {
                session: {
                  ...sessionNode("mate").session,
                  sessionKind: "teammate",
                },
                truncated: true,
              }),
            ],
            interactions: [],
          },
        ],
      }),
    };

    expect(formatExecutionTree(tree).split("\n")).toEqual([
      "session lead (main, codex) [running] lead",
      "  run r1 [running] 2026-10-01T00:00:00.000Z",
      "    tool Explore [in_progress]",
      "      subagent scan (not observable: provider reported no session events)",
      "    session mate (teammate, codex) [running] mate",
      "      deeper sessions omitted (raise --depth)",
    ]);
  });
});
