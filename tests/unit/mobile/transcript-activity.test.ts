import type { TranscriptItem } from "@cocurdex/mobile/internal/session-detail/transcript";
import { condenseTranscript } from "@cocurdex/mobile/internal/session-detail/transcript-activity";
import type { AgentToolCallRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const user = (id: string): TranscriptItem => ({
  kind: "user",
  id,
  text: id,
  images: [],
});
const reply = (id: string): TranscriptItem => ({
  kind: "assistant",
  id,
  text: id,
  streaming: false,
});
const tool = (
  id: string,
  status: AgentToolCallRecord["status"] = "completed",
): TranscriptItem => ({
  kind: "tool",
  id,
  title: `Read ${id}`,
  detail: null,
  status,
});

function record(
  id: string,
  kind: AgentToolCallRecord["kind"] = "read",
): AgentToolCallRecord {
  return {
    id,
    sessionId: "s1",
    title: `Read ${id}`,
    kind,
    status: "completed",
    locations: [],
    content: undefined,
    startedAt: "2026-10-25T00:00:00.000Z",
    updatedAt: "2026-10-25T00:00:00.000Z",
  };
}

const records = [
  record("t1"),
  record("t2"),
  record("t3", "execute"),
  record("t4"),
];

function shape(items: ReturnType<typeof condenseTranscript>) {
  return items.map((item) =>
    item.kind === "activity"
      ? `activity(${item.items.map((child) => child.id).join(",")})`
      : item.kind === "assistant" && item.turnEnd
        ? `${item.id}!`
        : item.id,
  );
}

describe("condenseTranscript", () => {
  it("folds a finished turn's work and interim replies above its answer", () => {
    const items = [
      user("u1"),
      tool("t1"),
      reply("a1"),
      tool("t2"),
      tool("t3"),
      reply("a2"),
      user("u2"),
      reply("a3"),
    ];
    expect(shape(condenseTranscript(items, records, false))).toEqual([
      "u1",
      "activity(t1,a1,t2,t3)",
      "a2!",
      "u2",
      "a3!",
    ]);
  });

  it("summarizes the folded tool calls by action", () => {
    const [, activity] = condenseTranscript(
      [user("u1"), tool("t1"), tool("t2"), tool("t3"), reply("a1")],
      records,
      false,
    );
    expect(activity).toMatchObject({
      kind: "activity",
      summary: {
        actions: [
          { action: "read", count: 2 },
          { action: "command", count: 1 },
        ],
        otherCount: 0,
      },
      replies: 0,
    });
  });

  it("shows a lone tool call as itself", () => {
    expect(
      shape(condenseTranscript([user("u1"), tool("t1"), reply("a1")], records)),
    ).toEqual(["u1", "t1", "a1!"]);
  });

  it("moves finished trailing work before the answer", () => {
    expect(
      shape(
        condenseTranscript(
          [user("u1"), tool("t1"), reply("a1"), tool("t2")],
          records,
          false,
        ),
      ),
    ).toEqual(["u1", "activity(t1,t2)", "a1!"]);
  });

  it("keeps replies visible beneath one stable running group", () => {
    const items = [
      user("u1"),
      reply("a0"),
      user("u2"),
      tool("t1"),
      tool("t2"),
      reply("a1"),
      tool("t3", "in_progress"),
    ];
    expect(shape(condenseTranscript(items, records, true))).toEqual([
      "u1",
      "a0!",
      "u2",
      "activity(t1,t2,t3)",
      "a1",
    ]);
  });
});

it("keeps the same running heading before and after tool events", () => {
  for (const items of [
    [user("u1")],
    [user("u1"), tool("t1")],
    [user("u1"), tool("t1"), reply("a1"), tool("t2")],
  ]) {
    const result = condenseTranscript(items, records, true);
    expect(result[1]).toMatchObject({
      kind: "activity",
      id: "activity:u1",
      running: true,
    });
    expect(result.filter((item) => item.kind === "activity")).toHaveLength(1);
  }
});

it("times only the live turn from the run start", () => {
  const items = [
    user("u1"),
    tool("t1"),
    tool("t3"),
    reply("a1"),
    user("u2"),
    tool("t2"),
  ];
  const result = condenseTranscript(items, records, true, 1_000);
  const activities = result.filter((item) => item.kind === "activity");
  expect(activities.map((item) => item.startedAt)).toEqual([undefined, 1_000]);
});
