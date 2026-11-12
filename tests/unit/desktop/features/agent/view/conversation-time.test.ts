import { formatSeparatorTime } from "@cocurdex/client-runtime";
import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import type { ConversationGroup } from "@/features/agent/view/chat-timeline";
import { separatorTimeBefore } from "@/features/agent/view/conversation-time";

function message(id: string, createdAt: Date): MessageRecord {
  return {
    id,
    createdAt: createdAt.toISOString(),
  } as MessageRecord;
}

function exchange(id: string, prompt: Date, reply: Date): ConversationGroup {
  const answer = message(`${id}-reply`, reply);
  return {
    id,
    prompt: message(`${id}-prompt`, prompt),
    items: [{ id: answer.id, kind: "message", message: answer }],
  };
}

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute);

describe("separatorTimeBefore", () => {
  it("marks the first exchange with its start", () => {
    const first = exchange("a", at(5, 9), at(5, 9, 1));
    expect(separatorTimeBefore(undefined, first)).toBe(at(5, 9).getTime());
  });

  it("skips exchanges that continue the conversation", () => {
    const first = exchange("a", at(5, 9), at(5, 9, 1));
    const next = exchange("b", at(5, 9, 40), at(5, 9, 41));
    expect(separatorTimeBefore(first, next)).toBeNull();
  });

  it("marks a gap of an hour after the previous reply", () => {
    const first = exchange("a", at(5, 9), at(5, 9, 30));
    const next = exchange("b", at(5, 10, 30), at(5, 10, 31));
    expect(separatorTimeBefore(first, next)).toBe(at(5, 10, 30).getTime());
  });

  it("marks a new day even after a short gap", () => {
    const first = exchange("a", at(5, 23, 50), at(5, 23, 55));
    const next = exchange("b", at(6, 0, 5), at(6, 0, 6));
    expect(separatorTimeBefore(first, next)).toBe(at(6, 0, 5).getTime());
  });
});

describe("formatSeparatorTime", () => {
  const now = at(6, 15).getTime();

  it("shows only the clock today", () => {
    expect(formatSeparatorTime(at(6, 9, 5).getTime(), now, "en-US")).toBe(
      "9:05 AM",
    );
  });

  it("names yesterday", () => {
    expect(formatSeparatorTime(at(5, 14, 53).getTime(), now, "en-US")).toBe(
      "Yesterday 2:53 PM",
    );
    expect(formatSeparatorTime(at(5, 14, 53).getTime(), now, "zh-CN")).toBe(
      "昨天 14:53",
    );
  });

  it("names the weekday within a week and the date beyond", () => {
    expect(formatSeparatorTime(at(3, 8).getTime(), now, "en-US")).toBe(
      "Tuesday 8:00 AM",
    );
    expect(
      formatSeparatorTime(new Date(2026, 9, 21, 8).getTime(), now, "en-US"),
    ).toBe("Oct 21 8:00 AM");
    expect(
      formatSeparatorTime(new Date(2025, 0, 2, 8).getTime(), now, "en-US"),
    ).toBe("Jan 2, 2025 8:00 AM");
  });
});
