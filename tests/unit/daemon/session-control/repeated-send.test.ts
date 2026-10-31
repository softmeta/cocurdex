import {
  MessageIdConflictError,
  resolveRepeatedSend,
} from "@cocurdex/daemon/internal/session-control/repeated-send";
import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const stored: MessageRecord = {
  id: "m1",
  sessionId: "s1",
  role: "user",
  content: "Fix the build",
  attachments: [],
  createdAt: "2026-10-11T00:00:00.000Z",
  runId: "r1",
};

describe("resolveRepeatedSend", () => {
  it("returns the stored message when a client retries the same send", () => {
    expect(
      resolveRepeatedSend(stored, {
        sessionId: "s1",
        messageId: "m1",
        content: "  Fix the build \n",
      }),
    ).toBe(stored);
  });

  it("rejects a different message that reuses the ID", () => {
    expect(() =>
      resolveRepeatedSend(stored, {
        sessionId: "s1",
        messageId: "m1",
        content: "Something else",
      }),
    ).toThrow(MessageIdConflictError);
    expect(() =>
      resolveRepeatedSend(stored, {
        sessionId: "s2",
        messageId: "m1",
        content: "Fix the build",
      }),
    ).toThrow(MessageIdConflictError);
  });

  it("rejects a retry whose attachments changed", () => {
    expect(() =>
      resolveRepeatedSend(stored, {
        sessionId: "s1",
        messageId: "m1",
        content: "Fix the build",
        attachments: [{ kind: "context-folder", folderPath: "/repo/src" }],
      }),
    ).toThrow(MessageIdConflictError);
  });
});
