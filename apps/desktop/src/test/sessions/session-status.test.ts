import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  getDisplaySessionStatus,
  isSessionAwaitingResponse,
} from "@/features/sessions/session-status";

const userMessage: MessageRecord = {
  id: "message-1",
  sessionId: "session-1",
  role: "user",
  content: "Stop should return the session to idle.",
  attachments: [],
  createdAt: "2026-05-18T00:00:00.000Z",
};

describe("getDisplaySessionStatus", () => {
  it("respects explicit idle status after a user message", () => {
    expect(getDisplaySessionStatus("idle", [userMessage])).toBe("idle");
  });

  it("uses pending user messages only when no status is known", () => {
    expect(getDisplaySessionStatus(undefined, [userMessage])).toBe("running");
  });
});

describe("isSessionAwaitingResponse", () => {
  it("detects a user message waiting for a reply", () => {
    expect(isSessionAwaitingResponse([userMessage])).toBe(true);
  });
});
