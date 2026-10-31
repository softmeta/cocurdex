import { unconfirmedSends } from "@cocurdex/mobile/internal/session-detail/pending-send";
import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function userMessage(id: string): MessageRecord {
  return {
    id,
    sessionId: "session-1",
    role: "user",
    content: "Review totals",
    attachments: [],
    createdAt: "2026-10-27T00:00:00.000Z",
  };
}

const first = { id: "message-1", text: "Review totals", images: [] };
const second = { id: "message-2", text: "And taxes", images: [] };

describe("unconfirmedSends", () => {
  it("keeps showing a send until the daemon reports its message", () => {
    expect(unconfirmedSends([first, second], [], [])).toEqual([first, second]);
  });

  it("drops a send once the daemon stores the message under its id", () => {
    expect(
      unconfirmedSends([first, second], [userMessage("message-1")], []),
    ).toEqual([second]);
  });

  it("drops a send the active run already streams", () => {
    expect(unconfirmedSends([first], [], [userMessage("message-1")])).toEqual(
      [],
    );
  });
});
