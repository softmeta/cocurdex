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

const shape = (items: ReturnType<typeof conversationTranscript>) =>
  items.map((item) => [item.kind, item.id]);

describe("conversationTranscript", () => {
  it("keeps only what was said, dropping every tool call", () => {
    const items = conversationTranscript(
      [user("ask"), tool("t1"), reply("think"), tool("t2"), reply("answer")],
      false,
    );
    expect(shape(items)).toEqual([
      ["user", "ask"],
      ["assistant", "think"],
      ["assistant", "answer"],
    ]);
  });

  it("shows one working line while the persona works without replying", () => {
    const items = conversationTranscript([user("ask"), tool("t1")], true);
    expect(shape(items)).toEqual([
      ["user", "ask"],
      ["activity", "activity:ask"],
    ]);
  });

  it("drops the working line once a reply is streaming", () => {
    const items = conversationTranscript(
      [user("ask"), reply("answer", true)],
      true,
    );
    expect(shape(items)).toEqual([
      ["user", "ask"],
      ["assistant", "answer"],
    ]);
  });
});
