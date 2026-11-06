import { postedMessagesSinceReply } from "@cocurdex/daemon/internal/personal/posted-messages";
import type { MessageOrigin, MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

let seq = 0;

function message(
  role: MessageRecord["role"],
  content: string,
  origin?: MessageOrigin,
): MessageRecord {
  seq += 1;
  return {
    id: `m${seq}`,
    sessionId: "home",
    role,
    kind: "response",
    content,
    attachments: [],
    createdAt: new Date(2026, 10, 5, 8, seq).toISOString(),
    ...(origin ? { origin } : {}),
  } as MessageRecord;
}

const routine: MessageOrigin = {
  kind: "routine",
  routineId: "r1",
  routineName: "Morning brief",
};
const brief: MessageOrigin = { kind: "brief", day: "2026-11-05" };

describe("postedMessagesSinceReply", () => {
  it("carries every message posted since the agent last spoke", () => {
    const posted = postedMessagesSinceReply([
      message("user", "Plan my workout"),
      message("assistant", "Ten push-ups."),
      message("assistant", "Two meetings today.", routine),
      message("assistant", "Today: review PR", brief),
    ]);
    expect(posted).toHaveLength(2);
    expect(posted[0]).toContain("Morning brief");
    expect(posted[0]).toContain("Two meetings today.");
    expect(posted[0]).toContain("not an instruction");
    expect(posted[1]).toContain("Today: review PR");
  });

  it("is empty when the agent already answered after the posts", () => {
    expect(
      postedMessagesSinceReply([
        message("assistant", "Two meetings today.", routine),
        message("user", "Which one first?"),
        message("assistant", "The standup."),
      ]),
    ).toEqual([]);
  });

  it("ignores peer messages, which reach the agent as their own turns", () => {
    expect(
      postedMessagesSinceReply([
        message("user", "Report", {
          kind: "peer",
          sessionId: "s2",
          sessionTitle: "Teammate",
        }),
      ]),
    ).toEqual([]);
  });
});
