import { conversationTranscript } from "@cocurdex/mobile/internal/session-detail/conversation-transcript";
import type { TranscriptItem } from "@cocurdex/mobile/internal/session-detail/transcript";
import { describe, expect, it } from "vitest";

const user = (id: string): TranscriptItem => ({
  kind: "user",
  id,
  text: id,
  images: [],
  report: null,
});
const reply = (id: string, streaming = false): TranscriptItem => ({
  kind: "assistant",
  id,
  text: id,
  streaming,
  source: null,
});
const tool = (id: string): TranscriptItem => ({
  kind: "tool",
  id,
  title: "Read",
  detail: "notes.md",
  status: "completed",
});

const options = (running: boolean, times = new Map<string, string>()) => ({
  live: { running, phase: "thinking" as const },
  times,
  separators: true,
});

const shape = (items: ReturnType<typeof conversationTranscript>) =>
  items.map((item) => [item.kind, item.id]);

describe("conversationTranscript", () => {
  it("keeps only what was said, dropping every tool call", () => {
    const items = conversationTranscript(
      [user("ask"), tool("t1"), reply("think"), tool("t2"), reply("answer")],
      options(false),
    );
    expect(shape(items)).toEqual([
      ["user", "ask"],
      ["assistant", "think"],
      ["assistant", "answer"],
    ]);
  });

  it("shows one working line while the persona works without replying", () => {
    const items = conversationTranscript(
      [user("ask"), tool("t1")],
      options(true),
    );
    expect(shape(items)).toEqual([
      ["user", "ask"],
      ["activity", "activity:ask"],
    ]);
  });

  it("drops the working line once a reply is streaming", () => {
    const items = conversationTranscript(
      [user("ask"), reply("answer", true)],
      options(true),
    );
    expect(shape(items)).toEqual([
      ["user", "ask"],
      ["assistant", "answer"],
    ]);
  });

  it("marks the last finished reply of each exchange as its turn end", () => {
    const items = conversationTranscript(
      [user("q1"), reply("a1"), reply("a2"), user("q2"), reply("a3")],
      options(true),
    );
    const ends = items.flatMap((item) =>
      item.kind === "assistant" && item.turnEnd ? [item.id] : [],
    );
    expect(ends).toEqual(["a2"]);
  });

  it("separates exchanges an hour or a day apart with their start time", () => {
    const times = new Map([
      ["q1", "2026-11-10T09:00:00"],
      ["a1", "2026-11-10T09:00:05"],
      ["q2", "2026-11-10T09:20:00"],
      ["a2", "2026-11-10T09:20:04"],
      ["q3", "2026-11-10T11:00:00"],
      ["a3", "2026-11-10T11:00:04"],
    ]);
    const items = conversationTranscript(
      [
        user("q1"),
        reply("a1"),
        user("q2"),
        reply("a2"),
        user("q3"),
        reply("a3"),
      ],
      options(false, times),
    );
    const separated = items.flatMap((item) =>
      "separatorTime" in item && item.separatorTime !== undefined
        ? [item.id]
        : [],
    );
    expect(separated).toEqual(["q1", "q3"]);
  });

  it("tells the working line which tools are still running", () => {
    const running: TranscriptItem = {
      kind: "tool",
      id: "t2",
      title: "Read",
      detail: null,
      status: "in_progress",
    };
    const [, line] = conversationTranscript(
      [user("ask"), tool("t1"), running],
      options(true),
    ).slice(-2);
    expect(line).toMatchObject({
      kind: "activity",
      phase: "thinking",
      items: [{ id: "t2" }],
    });
  });
});
