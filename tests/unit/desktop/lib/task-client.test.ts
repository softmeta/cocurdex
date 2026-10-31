import { afterEach, describe, expect, it, vi } from "vitest";

const requestDaemon = vi.hoisted(() => vi.fn());
const commandDaemon = vi.hoisted(() => vi.fn());
vi.mock("@/lib/daemon-client", () => ({ commandDaemon, requestDaemon }));
vi.mock("@/lib/daemon-events", () => ({ onDaemonAgentEvent: vi.fn() }));

const { taskApi } = await import("@/lib/task-client");

afterEach(() => {
  requestDaemon.mockReset();
  commandDaemon.mockReset();
});

describe("task client", () => {
  it("sends messages as commands keyed by their message id", async () => {
    commandDaemon.mockResolvedValue({ id: "message-1" });
    const input = {
      sessionId: "session-1",
      messageId: "message-1",
      content: "Run",
    };
    await taskApi.sendMessage(input);
    expect(commandDaemon).toHaveBeenCalledWith("session.send", input, {
      idempotencyKey: "message-1",
    });
  });

  it("propagates daemon failures instead of fabricating messages", async () => {
    commandDaemon.mockRejectedValue(
      new Error("The Cocurdex daemon is unavailable"),
    );
    await expect(
      taskApi.sendMessage({
        sessionId: "session-1",
        messageId: "message-1",
        content: "Run",
      }),
    ).rejects.toThrow("unavailable");
  });

  it("preserves a rejected approval result from the daemon", async () => {
    requestDaemon.mockResolvedValue(false);
    await expect(
      taskApi.resolvePermission("permission-1", "reject-once"),
    ).resolves.toBe(false);
    expect(requestDaemon).toHaveBeenCalledWith("permission.resolve", {
      requestId: "permission-1",
      optionId: "reject-once",
    });
  });

  it("normalizes missing plan approval feedback", async () => {
    requestDaemon.mockResolvedValue(true);
    await taskApi.resolvePlanApproval("approval-1", { outcome: "approved" });
    expect(requestDaemon).toHaveBeenCalledWith("planApproval.resolve", {
      approvalId: "approval-1",
      decision: { outcome: "approved", feedback: null },
    });
  });
});
