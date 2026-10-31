import {
  buildExecutionTree,
  type ExecutionTreeSource,
} from "@cocurdex/daemon/internal/execution-tree/build-execution-tree";
import type {
  AgentPermissionRequestRecord,
  AgentToolCallRecord,
  RunRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function session(
  id: string,
  overrides: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id,
    workspaceId: "ws",
    title: id,
    agentType: "codex",
    sessionKind: "main",
    parentSessionId: null,
    parentToolCallId: null,
    status: "idle",
    writeMode: "native-write",
    sessionModeId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    lastMessageAt: null,
    ...overrides,
  } as SessionRecord;
}

function run(
  id: string,
  sessionId: string,
  startedAt: string,
  endedAt: string | null,
): RunRecord {
  return {
    id,
    sessionId,
    triggerMessageId: `msg-${id}`,
    status: endedAt ? "completed" : "running",
    startedAt,
    endedAt,
  };
}

function toolCall(
  id: string,
  sessionId: string,
  overrides: Partial<AgentToolCallRecord> = {},
): AgentToolCallRecord {
  return {
    id,
    sessionId,
    title: id,
    kind: "execute",
    status: "completed",
    content: undefined,
    locations: [],
    startedAt: "2026-10-01T00:01:00.000Z",
    updatedAt: "2026-10-01T00:01:00.000Z",
    ...overrides,
  };
}

function permission(id: string, sessionId: string) {
  return {
    id,
    sessionId,
    providerId: "codex",
    kind: "execute",
    title: id,
    locations: [],
    options: [],
    status: "pending",
    createdAt: "2026-10-01T00:02:00.000Z",
    updatedAt: "2026-10-01T00:02:00.000Z",
  } as AgentPermissionRequestRecord;
}

function source(
  overrides: Partial<ExecutionTreeSource> = {},
): ExecutionTreeSource {
  return {
    sessions: [],
    runs: {},
    toolCalls: {},
    interactions: { permissions: [], questions: [], planApprovals: [] },
    plans: {},
    ...overrides,
  };
}

describe("buildExecutionTree", () => {
  it("returns null for an unknown root session", () => {
    expect(buildExecutionTree("missing", source(), 3)).toBeNull();
  });

  it("groups tool calls by run and keeps run-less calls on the session", () => {
    const tree = buildExecutionTree(
      "root",
      source({
        sessions: [session("root")],
        runs: { root: [run("r1", "root", "2026-10-01T00:00:00.000Z", null)] },
        toolCalls: {
          root: [
            toolCall("t1", "root", { runId: "r1" }),
            toolCall("t2", "root", { runId: null }),
            toolCall("t3", "root", { runId: "gone" }),
          ],
        },
      }),
      3,
    );

    expect(tree?.root.runs[0]?.toolCalls.map((n) => n.toolCall.id)).toEqual([
      "t1",
    ]);
    expect(tree?.root.toolCalls.map((n) => n.toolCall.id)).toEqual([
      "t2",
      "t3",
    ]);
  });

  it("keeps a bounded copy of each tool call's input for labels", () => {
    const longCommand = "x".repeat(2000);
    const tree = buildExecutionTree(
      "root",
      source({
        sessions: [session("root")],
        toolCalls: {
          root: [
            toolCall("t1", "root", {
              rawInput: {
                command: longCommand,
                input: { path: "src/a.ts", edits: [{ oldText: "a" }] },
              },
            }),
          ],
        },
      }),
      3,
    );

    const rawInput = tree?.root.toolCalls[0]?.toolCall.rawInput as {
      command: string;
      input: { path: string; edits: unknown };
    };
    expect(rawInput.command.length).toBeLessThan(longCommand.length);
    expect(longCommand.startsWith(rawInput.command)).toBe(true);
    expect(rawInput.input).toEqual({ path: "src/a.ts", edits: null });
  });

  it("nests a provider subagent session under the tool call that spawned it", () => {
    const tree = buildExecutionTree(
      "root",
      source({
        sessions: [
          session("root"),
          session("child", {
            sessionKind: "subagent",
            parentSessionId: "root",
            parentToolCallId: "task",
          }),
        ],
        toolCalls: {
          root: [
            toolCall("task", "root", {
              subagent: {
                sessionId: "child",
                type: "explore",
                description: "",
              },
            }),
          ],
          child: [toolCall("grep", "child")],
        },
      }),
      3,
    );

    const task = tree?.root.toolCalls[0];
    expect(task?.observability).toBe("full");
    expect(task?.child?.session.id).toBe("child");
    expect(task?.child?.toolCalls[0]?.toolCall.id).toBe("grep");
    expect(tree?.root.children).toEqual([]);
  });

  it("nests a teammate under the spawn call that created it", () => {
    const spawn = (id: string, name: string, startedAt: string) =>
      toolCall(id, "lead", {
        title: "team_spawn_teammate",
        kind: "team_spawn_teammate",
        rawInput: { name, prompt: "research" },
        startedAt,
        updatedAt: startedAt,
      });
    const tree = buildExecutionTree(
      "lead",
      source({
        sessions: [
          session("lead"),
          session("a", {
            title: "paseo-research",
            sessionKind: "teammate",
            parentSessionId: "lead",
            createdAt: "2026-10-01T00:01:00.500Z",
          }),
          session("b", {
            title: "t3code-research",
            sessionKind: "teammate",
            parentSessionId: "lead",
            createdAt: "2026-10-01T00:01:00.600Z",
          }),
          session("c", {
            title: "renamed",
            sessionKind: "teammate",
            parentSessionId: "lead",
            createdAt: "2026-10-01T00:05:00.000Z",
          }),
        ],
        toolCalls: {
          lead: [
            spawn("s1", "paseo-research", "2026-10-01T00:01:00.000Z"),
            spawn("s2", "t3code-research", "2026-10-01T00:01:00.000Z"),
            toolCall("other", "lead"),
          ],
        },
      }),
      3,
    );

    const childOf = (id: string) =>
      tree?.root.toolCalls.find((node) => node.toolCall.id === id)?.child
        ?.session.id;
    expect(childOf("s1")).toBe("a");
    expect(childOf("s2")).toBe("b");
    expect(tree?.root.children.map((node) => node.session.id)).toEqual(["c"]);
  });

  it("marks a subagent call without a recorded session as limited instead of inventing one", () => {
    const tree = buildExecutionTree(
      "root",
      source({
        sessions: [session("root")],
        toolCalls: {
          root: [
            toolCall("task", "root", {
              subagent: { sessionId: "unseen", type: null, description: "" },
            }),
          ],
        },
      }),
      3,
    );

    expect(tree?.root.toolCalls[0]).toMatchObject({
      child: null,
      observability: "limited",
    });
  });

  it("attributes delegated sessions to the run active when they were created", () => {
    const tree = buildExecutionTree(
      "root",
      source({
        sessions: [
          session("root"),
          session("mate", {
            sessionKind: "teammate",
            parentSessionId: "root",
            createdAt: "2026-10-01T00:05:00.000Z",
          }),
          session("late", {
            sessionKind: "subagent",
            parentSessionId: "root",
            createdAt: "2026-10-01T02:00:00.000Z",
          }),
        ],
        runs: {
          root: [
            run(
              "r1",
              "root",
              "2026-10-01T00:00:00.000Z",
              "2026-10-01T01:00:00.000Z",
            ),
          ],
        },
      }),
      3,
    );

    expect(tree?.root.runs[0]?.delegated.map((n) => n.session.id)).toEqual([
      "mate",
    ]);
    expect(tree?.root.children.map((n) => n.session.id)).toEqual(["late"]);
  });

  it("attaches pending interactions to the running run of their session", () => {
    const tree = buildExecutionTree(
      "root",
      source({
        sessions: [
          session("root"),
          session("child", { parentSessionId: "root" }),
        ],
        runs: { root: [run("r1", "root", "2026-10-01T00:00:00.000Z", null)] },
        interactions: {
          permissions: [permission("p1", "root"), permission("p2", "child")],
          questions: [],
          planApprovals: [],
        },
      }),
      3,
    );

    expect(tree?.root.runs[0]?.interactions).toEqual([
      { kind: "permission", record: expect.objectContaining({ id: "p1" }) },
    ]);
    expect(tree?.root.runs[0]?.delegated[0]?.interactions).toEqual([
      { kind: "permission", record: expect.objectContaining({ id: "p2" }) },
    ]);
  });

  it("stops at maxDepth and reports the cut", () => {
    const tree = buildExecutionTree(
      "a",
      source({
        sessions: [
          session("a"),
          session("b", { parentSessionId: "a" }),
          session("c", { parentSessionId: "b" }),
        ],
      }),
      1,
    );

    const b = tree?.root.children[0];
    expect(b?.session.id).toBe("b");
    expect(b?.truncated).toBe(true);
    expect(b?.children).toEqual([]);
  });

  it("does not loop on a parent cycle", () => {
    const tree = buildExecutionTree(
      "a",
      source({
        sessions: [
          session("a", { parentSessionId: "b" }),
          session("b", { parentSessionId: "a" }),
        ],
      }),
      5,
    );

    expect(tree?.root.children[0]?.session.id).toBe("b");
    expect(tree?.root.children[0]?.children).toEqual([]);
  });
});
