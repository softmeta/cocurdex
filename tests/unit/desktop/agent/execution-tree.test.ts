import type {
  ExecutionRunNode,
  ExecutionSessionNode,
  ExecutionToolCallNode,
  SessionExecutionTree,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  formatExecutionDuration,
  getExecutionToolCallDurationMs,
  getExecutionToolCallLabel,
  getOutputTail,
} from "@/features/agent/execution-tree/execution-tree-output";
import {
  type ExecutionTreeRow,
  flattenExecutionTree,
  groupExecutionTreeSections,
  toggleExpansion,
} from "@/features/agent/execution-tree/execution-tree-rows";

function toolCall(
  id: string,
  status: ExecutionToolCallNode["toolCall"]["status"] = "completed",
): ExecutionToolCallNode {
  return {
    toolCall: {
      id,
      title: id,
      kind: "exec",
      status,
      startedAt: "2026-10-13T10:00:00.000Z",
      updatedAt: "2026-10-13T10:00:02.500Z",
    },
    subagent: null,
    child: null,
    observability: "full",
  };
}

function run(
  id: string,
  toolCalls: ExecutionToolCallNode[],
  status: ExecutionRunNode["run"]["status"] = "completed",
): ExecutionRunNode {
  return {
    run: {
      id,
      sessionId: "root",
      triggerMessageId: `message-${id}`,
      status,
      startedAt: "2026-10-13T10:00:00.000Z",
      endedAt: status === "running" ? null : "2026-10-13T10:02:14.000Z",
    },
    toolCalls,
    delegated: [],
    interactions: [],
  };
}

function tree(runs: ExecutionRunNode[]): SessionExecutionTree {
  const root: ExecutionSessionNode = {
    session: {
      id: "root",
      title: "Root",
      agentType: "codex",
      sessionKind: "main",
      status: "running",
      parentSessionId: null,
      parentToolCallId: null,
      createdAt: "2026-10-13T10:00:00.000Z",
      updatedAt: "2026-10-13T10:00:00.000Z",
    },
    runs,
    toolCalls: [],
    children: [],
    interactions: [],
    plan: null,
    truncated: false,
  };
  return { root, maxDepth: 4 };
}

function keys(rows: ExecutionTreeRow[]) {
  return rows.map((row) => row.key);
}

function rowByKey(rows: ExecutionTreeRow[], key: string) {
  const row = rows.find((candidate) => candidate.key === key);
  if (!row || !("expanded" in row)) throw new Error(`no row ${key}`);
  return row;
}

function collapse(key: string, view = new Map<string, boolean>()) {
  return new Map(view).set(key, false);
}

function childSession(
  id: string,
  toolCalls: ExecutionToolCallNode[],
): ExecutionSessionNode {
  return {
    ...tree([]).root,
    session: {
      ...tree([]).root.session,
      id,
      title: id,
      status: "idle",
      sessionKind: "teammate",
      parentSessionId: "root",
    },
    toolCalls,
  };
}

function withChildren(
  toolCalls: ExecutionToolCallNode[],
  children: ExecutionSessionNode[],
): SessionExecutionTree {
  const base = tree([]);
  return { ...base, root: { ...base.root, toolCalls, children } };
}

describe("flattenExecutionTree", () => {
  const sample = tree([
    run("old", [toolCall("old-a"), toolCall("old-b", "failed")]),
    run("latest", [toolCall("new-a")], "running"),
  ]);

  it("collapses earlier runs and expands the latest run by default", () => {
    expect(keys(flattenExecutionTree(sample))).toEqual([
      "session:root",
      "run:old",
      "run:latest",
      "tool:new-a",
    ]);
  });

  it("summarizes a collapsed run's tool calls and failures", () => {
    const oldRun = flattenExecutionTree(sample).find(
      (row) => row.key === "run:old",
    );
    expect(oldRun).toMatchObject({
      expanded: false,
      summary: { toolCount: 2, failedCount: 1, waitingCount: 0 },
    });
  });

  it("expands a collapsed run once toggled", () => {
    const rows = flattenExecutionTree(sample);
    const expansion = toggleExpansion(new Map(), rowByKey(rows, "run:old"));
    expect(
      keys(flattenExecutionTree(sample, { expansion, issuesOnly: false })),
    ).toEqual([
      "session:root",
      "run:old",
      "tool:old-a",
      "tool:old-b",
      "run:latest",
      "tool:new-a",
    ]);
  });

  it("keeps only runs and tool calls with failures when filtering issues", () => {
    expect(
      keys(
        flattenExecutionTree(sample, {
          expansion: new Map(),
          issuesOnly: true,
        }),
      ),
    ).toEqual(["session:root", "run:old", "tool:old-b"]);
  });

  it("lets a run be collapsed while filtering issues", () => {
    const expansion = collapse("run:old");
    expect(
      keys(flattenExecutionTree(sample, { expansion, issuesOnly: true })),
    ).toEqual(["session:root", "run:old"]);
  });

  it("expands a failed run by default", () => {
    const failed = tree([
      run("failed", [toolCall("failed-a")], "failed"),
      run("latest", [toolCall("new-a")]),
    ]);
    expect(keys(flattenExecutionTree(failed))).toEqual([
      "session:root",
      "run:failed",
      "tool:failed-a",
      "run:latest",
      "tool:new-a",
    ]);
  });

  it("marks a run without children as not expandable", () => {
    const empty = tree([run("old", [toolCall("a")]), run("latest", [])]);
    const latest = flattenExecutionTree(empty).find(
      (row) => row.key === "run:latest",
    );
    expect(latest).toMatchObject({ expandable: false, expanded: false });
  });

  it("does not expand a failed run whose tool calls are all filtered out", () => {
    const failed = tree([run("failed", [toolCall("ok")], "failed")]);
    const row = flattenExecutionTree(failed, {
      expansion: new Map(),
      issuesOnly: true,
    }).find((candidate) => candidate.key === "run:failed");
    expect(row).toMatchObject({ expandable: false, expanded: false });
  });
});

describe("execution tree with subagent sessions", () => {
  const team = withChildren(
    [toolCall("spawn"), toolCall("lead-failed", "failed")],
    [
      childSession("worker-a", [toolCall("a-1"), toolCall("a-2", "failed")]),
      childSession("worker-b", [toolCall("b-1")]),
    ],
  );

  it("folds the lead's own calls and its subagents so subagents stay in view", () => {
    expect(keys(flattenExecutionTree(team))).toEqual([
      "session:root",
      "tools:root",
      "session:worker-a",
      "session:worker-b",
    ]);
  });

  it("summarizes a folded subagent's calls and failures", () => {
    expect(
      rowByKey(flattenExecutionTree(team), "session:worker-a"),
    ).toMatchObject({
      expanded: false,
      summary: { toolCount: 2, failedCount: 1 },
    });
  });

  it("lists a subagent's calls directly once it is expanded", () => {
    const expansion = new Map([["session:worker-b", true]]);
    expect(
      keys(flattenExecutionTree(team, { expansion, issuesOnly: false })),
    ).toEqual([
      "session:root",
      "tools:root",
      "session:worker-a",
      "session:worker-b",
      "tool:b-1",
    ]);
  });

  it("opens only the failing branches when filtering issues", () => {
    expect(
      keys(
        flattenExecutionTree(team, {
          expansion: new Map(),
          issuesOnly: true,
        }),
      ),
    ).toEqual([
      "session:root",
      "tools:root",
      "tool:lead-failed",
      "session:worker-a",
      "tool:a-2",
    ]);
  });

  it("nests rows under their session for sticky headers", () => {
    const expansion = new Map([
      ["tools:root", true],
      ["session:worker-a", true],
    ]);
    const sections = groupExecutionTreeSections(
      flattenExecutionTree(team, { expansion, issuesOnly: false }),
    );
    const outline = (items: typeof sections): unknown[] =>
      items.map((item) =>
        item.children.length > 0
          ? { [item.row.key]: outline(item.children), level: item.level }
          : item.row.key,
      );
    expect(outline(sections)).toEqual([
      {
        "session:root": [
          "tools:root",
          "tool:spawn",
          "tool:lead-failed",
          { "session:worker-a": ["tool:a-1", "tool:a-2"], level: 1 },
          "session:worker-b",
        ],
        level: 0,
      },
    ]);
  });
});

describe("execution tree tool call display", () => {
  it("labels a named tool with its input", () => {
    expect(
      getExecutionToolCallLabel({
        ...toolCall("x").toolCall,
        title: "bash",
        kind: "bash",
        rawInput: { command: "git status --short" },
      }),
    ).toBe("bash · git status --short");
  });

  it("drops the login shell wrapper from command titles", () => {
    expect(
      getExecutionToolCallLabel({
        ...toolCall("x").toolCall,
        title: "/bin/zsh -lc 'git status --short --branch'",
      }),
    ).toBe("git status --short --branch");
  });

  it("reports duration only for finished tool calls", () => {
    expect(getExecutionToolCallDurationMs(toolCall("done").toolCall)).toBe(
      2500,
    );
    expect(
      getExecutionToolCallDurationMs(toolCall("busy", "in_progress").toolCall),
    ).toBeNull();
  });

  it("shows sub-second durations with one decimal", () => {
    expect(formatExecutionDuration(0)).toBe("0.1s");
    expect(formatExecutionDuration(400)).toBe("0.4s");
    expect(formatExecutionDuration(2500)).toBe("3s");
  });

  it("keeps the last output lines and counts the hidden ones", () => {
    const text = ["one", "two", "three", "four"].join("\r\n");
    expect(
      getOutputTail({ content: [{ type: "text", text }], rawOutput: null }, 2),
    ).toEqual({ text: "three\nfour", omittedLines: 2 });
    expect(getOutputTail({ content: [], rawOutput: null })).toBeNull();
  });
});
