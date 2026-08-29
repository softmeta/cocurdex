import type { MessageRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  createNativeSessionRecoveryError,
  requiresNativeSessionRecovery,
} from "./session-recovery";

function message(role: MessageRecord["role"]): MessageRecord {
  return {
    id: crypto.randomUUID(),
    sessionId: "session-1",
    role,
    content: "content",
    attachments: [],
    createdAt: "2026-08-03T00:00:00.000Z",
  };
}

describe("native session recovery", () => {
  it("requires recovery only after the initial user message", () => {
    expect(requiresNativeSessionRecovery([])).toBe(false);
    expect(requiresNativeSessionRecovery([message("user")])).toBe(false);
    expect(
      requiresNativeSessionRecovery([message("user"), message("assistant")]),
    ).toBe(true);
  });

  it("explains that no fallback prompt was sent", () => {
    expect(createNativeSessionRecoveryError("Codex").message).toBe(
      "Codex could not restore its native session. Cocurdex stopped before sending the prompt to avoid replaying history and consuming unexpected tokens.",
    );
  });
});
