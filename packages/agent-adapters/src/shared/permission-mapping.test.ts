import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import type { SessionRecord } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import { createClaudeCanUseTool } from "../claude-shared/claude-permissions";
import { requestCodexPermission } from "../codex/codex-permissions";
import { requestCodexQuestion } from "../codex/codex-questions";
import {
  createOpenCodePermissionRequest,
  mapOpenCodeDecision,
} from "../opencode/opencode-permissions";

function session(agentType: SessionRecord["agentType"]): SessionRecord {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "Session",
    agentType,
    status: "running",
    writeMode: "native-write",
    collaborationMode: "default",
    createdAt: "2026-05-01T12:00:00.000Z",
    updatedAt: "2026-05-01T12:00:00.000Z",
    lastMessageAt: null,
  };
}

function payload(
  agentType: SessionRecord["agentType"],
  decision:
    | "allow_once"
    | "allow_always"
    | "reject_once"
    | "reject_always"
    | "cancelled",
): CreateAgentSessionPayload {
  return {
    session: session(agentType),
    workspaceRootPath: "/tmp/repo",
    requestPermission: vi.fn(async () => decision),
    requestQuestion: vi.fn(async () => "Use src/app.tsx"),
    requestPlanApproval: vi.fn(async () => ({ outcome: "approved" as const })),
  };
}

describe("permission mapping", () => {
  it("maps Codex command approvals through the shared resolver", async () => {
    const requestPayload = payload("codex", "allow_once");

    const result = await requestCodexPermission(requestPayload, {
      method: "item/commandExecution/requestApproval",
      params: { command: "pnpm test" },
    });

    expect(result).toEqual({ decision: "accept" });
    expect(requestPayload.requestPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "command",
        providerId: "codex",
        title: "pnpm test",
      }),
    );
  });

  it("maps Codex always-allow command approvals to acceptForSession", async () => {
    const requestPayload = payload("codex", "allow_always");

    const result = await requestCodexPermission(requestPayload, {
      method: "item/commandExecution/requestApproval",
      params: { command: "pnpm test" },
    });

    expect(result).toEqual({ decision: "acceptForSession" });
  });

  it("maps Codex permission escalations to granted permission profiles", async () => {
    const requestPayload = payload("codex", "allow_always");

    const result = await requestCodexPermission(requestPayload, {
      method: "item/permissions/requestApproval",
      params: {
        reason: "Select a workspace root",
        cwd: "/tmp/repo",
        permissions: {
          network: null,
          fileSystem: { read: null, write: ["/tmp/repo"] },
        },
      },
    });

    expect(result).toEqual({
      permissions: { fileSystem: { read: null, write: ["/tmp/repo"] } },
      scope: "session",
    });
  });

  it("maps Codex user input requests through the shared question resolver", async () => {
    const requestPayload = payload("codex", "allow_once");

    const result = await requestCodexQuestion(requestPayload, {
      method: "item/tool/requestUserInput",
      params: {
        threadId: "thr_1",
        turnId: "turn_1",
        itemId: "item_1",
        questions: [
          {
            id: "question-1",
            header: "File",
            question: "Which file should I inspect?",
            isOther: false,
            isSecret: false,
            options: null,
          },
        ],
        autoResolutionMs: null,
      },
    });

    expect(result).toEqual({
      answers: { "question-1": { answers: ["Use src/app.tsx"] } },
    });
    expect(requestPayload.requestQuestion).toHaveBeenCalledWith({
      id: "question-1",
      providerId: "codex",
      question: "Which file should I inspect?",
      sessionId: "session-1",
    });
  });

  it("maps Claude canUseTool allow and deny decisions", async () => {
    const allowPayload = payload("claude-agent", "allow_once");
    const denyPayload = payload("claude-agent", "reject_once");
    const options = {
      signal: new AbortController().signal,
      toolUseID: "tool-1",
      title: "Edit file",
    };

    await expect(
      createClaudeCanUseTool(allowPayload)(
        "Edit",
        { path: "src/app.ts" },
        options,
      ),
    ).resolves.toMatchObject({
      behavior: "allow",
      toolUseID: "tool-1",
    });
    await expect(
      createClaudeCanUseTool(denyPayload)(
        "Edit",
        { path: "src/app.ts" },
        options,
      ),
    ).resolves.toMatchObject({
      behavior: "deny",
      toolUseID: "tool-1",
    });
  });

  it("maps Claude AskUserQuestion into structured answers instead of permission", async () => {
    const requestPayload = payload("claude-agent", "allow_once");

    await expect(
      createClaudeCanUseTool(requestPayload)(
        "AskUserQuestion",
        {
          questions: [
            {
              question: "Which approach?",
              header: "Approach",
              options: [
                { label: "Keep", description: "Preserve the current API." },
                { label: "Migrate", description: "Change the API." },
              ],
              multiSelect: false,
            },
          ],
        },
        {
          signal: new AbortController().signal,
          toolUseID: "question-1",
        },
      ),
    ).resolves.toEqual({
      behavior: "allow",
      toolUseID: "question-1",
      updatedInput: {
        questions: [expect.objectContaining({ question: "Which approach?" })],
        answers: { "Which approach?": "Use src/app.tsx" },
      },
    });

    expect(requestPayload.requestPermission).not.toHaveBeenCalled();
    expect(requestPayload.requestQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        header: "Approach",
        multiSelect: false,
        options: [
          { label: "Keep", description: "Preserve the current API." },
          { label: "Migrate", description: "Change the API." },
        ],
      }),
    );
  });

  it("maps Claude ExitPlanMode into the shared plan approval flow", async () => {
    const requestPayload = payload("claude-agent", "allow_once");

    await expect(
      createClaudeCanUseTool(requestPayload)(
        "ExitPlanMode",
        {
          plan: "## Plan\n\n1. Update the adapter.",
          planFilePath: "/tmp/plan.md",
          allowedPrompts: [],
        },
        {
          signal: new AbortController().signal,
          toolUseID: "plan-1",
        },
      ),
    ).resolves.toMatchObject({
      behavior: "allow",
      toolUseID: "plan-1",
    });

    expect(requestPayload.requestPermission).not.toHaveBeenCalled();
    expect(requestPayload.requestPlanApproval).toHaveBeenCalledWith({
      id: "plan-1",
      planContent: "## Plan\n\n1. Update the adapter.",
      providerId: "claude-agent",
      sessionId: "session-1",
      source: "file-backed",
    });
  });

  it("maps Claude always-allow decisions into persistent permission updates", async () => {
    const rememberPayload = payload("claude-agent", "allow_always");

    await expect(
      createClaudeCanUseTool(rememberPayload)(
        "Edit",
        { file_path: "/tmp/repo/src/app.tsx" },
        {
          signal: new AbortController().signal,
          suggestions: [
            {
              type: "addRules",
              behavior: "allow",
              destination: "localSettings",
              rules: [
                {
                  toolName: "Edit",
                  ruleContent: "/tmp/repo/src/app.tsx",
                },
              ],
            },
          ],
          title: "Edit file",
          toolUseID: "tool-remember",
        },
      ),
    ).resolves.toMatchObject({
      behavior: "allow",
      toolUseID: "tool-remember",
      updatedPermissions: [
        expect.objectContaining({ destination: "localSettings" }),
      ],
    });
  });

  it("maps OpenCode permissions to shared requests and replies", () => {
    const requestPayload = payload("opencode", "allow_once");
    const request = createOpenCodePermissionRequest(requestPayload, {
      id: "permission-1",
      type: "bash",
      pattern: "pnpm *",
      sessionID: "opencode-session-1",
      messageID: "message-1",
      title: "Run command",
      metadata: { path: "/tmp/repo/package.json" },
      time: { created: Date.now() },
    });

    expect(request).toMatchObject({
      id: "permission-1",
      kind: "bash",
      providerId: "opencode",
      locations: [{ path: "/tmp/repo/package.json" }],
    });
    expect(mapOpenCodeDecision("allow_once")).toBe("once");
    expect(mapOpenCodeDecision("allow_always")).toBe("always");
    expect(mapOpenCodeDecision("reject_once")).toBe("reject");
    expect(mapOpenCodeDecision("reject_always")).toBe("reject");
    expect(mapOpenCodeDecision("cancelled")).toBe("reject");
  });
});
