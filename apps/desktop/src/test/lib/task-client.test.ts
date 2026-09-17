import type { TaskApi } from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { taskApi } from "../../lib/task-client";

const original = window.taskApi;
afterEach(() => {
  window.taskApi = original;
});

describe("task client connection boundary", () => {
  it("rejects disconnected commands instead of fabricating successful messages", async () => {
    Reflect.deleteProperty(window, "taskApi");
    await expect(
      taskApi.sendMessage({ sessionId: "session-1", content: "Run" }),
    ).rejects.toThrow("unavailable");
    await expect(taskApi.listSessions()).rejects.toThrow("unavailable");
    expect(() => taskApi.onAgentEvent(() => {})).toThrow("unavailable");
  });

  it("uses the current connection and preserves a rejected approval result", async () => {
    const first = vi.fn().mockResolvedValue(true);
    const second = vi.fn().mockResolvedValue(false);
    window.taskApi = { resolvePermission: first } as unknown as TaskApi;
    await expect(
      taskApi.resolvePermission("permission-1", "reject-once"),
    ).resolves.toBe(true);
    window.taskApi = { resolvePermission: second } as unknown as TaskApi;
    await expect(
      taskApi.resolvePermission("permission-1", "reject-once"),
    ).resolves.toBe(false);
    expect(second).toHaveBeenCalledWith("permission-1", "reject-once");
  });
});
