import type {
  AgentEvent,
  AgentId,
  AgentProviderSnapshot,
} from "@cocurdex/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAgentAdapterMock } = vi.hoisted(() => ({
  createAgentAdapterMock: vi.fn(),
}));

vi.mock("../agent-adapter-factory", () => ({
  createAgentAdapter: createAgentAdapterMock,
}));

import {
  generateAgentCommitMessage,
  resolveCommitMessagePermission,
} from "./agent-commit-message";

const providerSnapshot = {
  providerId: "test-provider",
  providerName: "Test Provider",
  modelId: "test-model",
  modelName: "Test Model",
  api: "openai-responses",
  baseUrl: "https://example.com",
} as AgentProviderSnapshot;

describe("generateAgentCommitMessage", () => {
  beforeEach(() => {
    createAgentAdapterMock.mockReset();
  });

  it.each<AgentId>([
    "pi",
    "grok-build",
    "codex",
    "claude-agent",
    "opencode",
  ])("uses the selected %s runtime and disposes it", async (agentId) => {
    const dispose = vi.fn();
    const sendMessage = vi.fn(async () => ({
      id: "user-message-1",
      sessionId: "session-1",
      role: "user" as const,
      content: "change summary",
      attachments: [],
      createdAt: "2026-08-12T00:00:00.000Z",
    }));
    const createSession = vi.fn(
      (_payload: unknown, onEvent: (event: AgentEvent) => void) => ({
        sendMessage: vi.fn(async (...args: Parameters<typeof sendMessage>) => {
          onEvent({
            type: "message.completed",
            sessionId: "session-1",
            message: {
              id: "assistant-message-1",
              sessionId: "session-1",
              role: "assistant",
              kind: "response",
              content:
                "fix(git): sync model picker\n\n- Keep agent and model selections aligned",
              attachments: [],
              createdAt: "2026-08-12T00:00:01.000Z",
            },
          });
          return sendMessage(...args);
        }),
        stop: vi.fn(),
        dispose,
      }),
    );
    createAgentAdapterMock.mockReturnValue({ createSession });

    const result = await generateAgentCommitMessage({
      agentId,
      providerSnapshot,
      providerConfig: { ...providerSnapshot, apiKey: null },
      workspaceRootPath: "/workspace",
      changeSummary: "M\tapps/desktop/src/features/settings/git-settings.tsx",
    });

    expect(result).toBe(
      "fix(git): sync model picker\n\n- Keep agent and model selections aligned",
    );
    expect(createAgentAdapterMock).toHaveBeenCalledWith(agentId);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({
          agentType: agentId,
          writeMode: "read-only",
        }),
        workspaceRootPath: "/workspace",
      }),
      expect.any(Function),
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("<change_summary>"),
        providerSnapshot,
      }),
    );
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("waits for an assistant response emitted after sendMessage returns", async () => {
    const dispose = vi.fn();
    createAgentAdapterMock.mockReturnValue({
      createSession: (
        _payload: unknown,
        onEvent: (event: AgentEvent) => void,
      ) => ({
        sendMessage: vi.fn(async () => {
          setTimeout(() => {
            onEvent({
              type: "message.completed",
              sessionId: "session-1",
              message: {
                id: "assistant-message-1",
                sessionId: "session-1",
                role: "assistant",
                kind: "response",
                content:
                  "Update Git commit handling\n\n- Wait for the asynchronous agent response",
                attachments: [],
                createdAt: "2026-08-12T00:00:01.000Z",
              },
            });
          }, 0);
          return {
            id: "user-message-1",
            sessionId: "session-1",
            role: "user" as const,
            content: "change summary",
            attachments: [],
            createdAt: "2026-08-12T00:00:00.000Z",
          };
        }),
        stop: vi.fn(),
        dispose,
      }),
    });

    const result = await generateAgentCommitMessage({
      agentId: "codex",
      providerSnapshot,
      providerConfig: { ...providerSnapshot, apiKey: null },
      workspaceRootPath: "/workspace",
      changeSummary: "M\tapps/desktop/electron/workspace/git-commit-service.ts",
    });

    expect(result).toBe(
      "Update Git commit handling\n\n- Wait for the asynchronous agent response",
    );
    expect(dispose).toHaveBeenCalledOnce();
  });
});

describe("resolveCommitMessagePermission", () => {
  it.each([
    "Read",
    "Glob",
    "Grep",
    "list",
    "search",
  ])("allows the read-only %s tool once", (kind) => {
    expect(resolveCommitMessagePermission(kind)).toBe("allow_once");
  });

  it.each([
    "edit",
    "delete",
    "move",
    "command",
    "execute",
    "other",
  ])("rejects the side-effecting or unknown %s tool", (kind) => {
    expect(resolveCommitMessagePermission(kind)).toBe("reject_always");
  });
});
