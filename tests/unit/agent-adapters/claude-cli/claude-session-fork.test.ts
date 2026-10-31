import { forkClaudeProviderSession } from "@cocurdex/agent-adapters/internal/claude-cli/claude-session-fork";
import { describe, expect, it, vi } from "vitest";

const fingerprint = JSON.stringify({ workspaceRootPath: "/repo" });

function source(state: Record<string, unknown>) {
  return {
    sessionId: "source",
    providerSessionId: "claude-1",
    providerStateJson: JSON.stringify({
      runtimeFingerprint: fingerprint,
      ...state,
    }),
    providerVersion: "claude-agent-sdk",
    resumable: true,
    updatedAt: "2026-10-12T00:00:00.000Z",
  };
}

describe("forkClaudeProviderSession", () => {
  it("forks the transcript up to the resume cursor into a new session", async () => {
    const forkSession = vi.fn(async () => ({ sessionId: "claude-2" }));
    const record = await forkClaudeProviderSession(
      {
        source: source({ resumeSessionAt: "uuid-7", turnCount: 4 }),
        targetSessionId: "fork",
        userTurnCount: null,
        workspaceRootPath: "/repo",
      },
      forkSession,
      "claude-agent-sdk",
    );

    expect(forkSession).toHaveBeenCalledWith("claude-1", {
      dir: "/repo",
      upToMessageId: "uuid-7",
    });
    expect(record).toMatchObject({
      sessionId: "fork",
      providerSessionId: "claude-2",
      resumable: true,
    });
    expect(JSON.parse(record?.providerStateJson ?? "{}")).toMatchObject({
      adapter: "claude-agent-sdk",
      resume: "claude-2",
      runtimeFingerprint: fingerprint,
      sessionId: "claude-2",
      turnCount: 0,
    });
  });

  it("refuses a transcript recorded for another workspace", async () => {
    const forkSession = vi.fn();
    await expect(
      forkClaudeProviderSession(
        {
          source: source({}),
          targetSessionId: "fork",
          userTurnCount: null,
          workspaceRootPath: "/other",
        },
        forkSession,
        "claude-agent-sdk",
      ),
    ).rejects.toThrow("different workspace");
    expect(forkSession).not.toHaveBeenCalled();
  });
});
