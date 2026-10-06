import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSession } from "@cocurdex/agent-core";
import type { AgentDescriptor, AgentEvent } from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { grokBuildPlanApprovalRequest } from "../grok-build/grok-build-plan-approval";
import { AcpAgentAdapter } from "./acp-agent-adapter";
import { ACP_TRACE_DIR_ENV } from "./acp-trace";

const FAKE_AGENT_PATH = fileURLToPath(
  new URL("../../test-fixtures/fake-acp-agent.mjs", import.meta.url),
);

const descriptor: AgentDescriptor = {
  id: "acp:fake",
  label: "Fake Agent",
  availability: "available",
  capabilities: {
    sessionModes: [],
    permissionModes: [],
    writeModes: ["read-only", "native-write"],
    supportsSteering: false,
    supportsSelections: true,
    supportsStreaming: true,
    sessionTitleStrategy: "native",
    transport: "acp",
  },
};

const sessions: AgentSession[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(sessions.splice(0).map((session) => session.dispose?.()));
});

function startSession(
  options: {
    requestPlanApproval?: Parameters<
      AcpAgentAdapter["createSession"]
    >[0]["requestPlanApproval"];
  } = {},
) {
  const events: AgentEvent[] = [];
  const session = new AcpAgentAdapter({
    command: process.execPath,
    args: [FAKE_AGENT_PATH],
    descriptor,
    planApprovalRequest: grokBuildPlanApprovalRequest,
  }).createSession(
    {
      session: {
        id: "app-session",
        workspaceId: "workspace-1",
        title: "Fake",
        agentType: "acp:fake",
        status: "idle",
        writeMode: "native-write",
        sessionModeId: null,
        createdAt: "2026-10-06T00:00:00.000Z",
        updatedAt: "2026-10-06T00:00:00.000Z",
        lastMessageAt: null,
      },
      workspaceRootPath: process.cwd(),
      requestPlanApproval: options.requestPlanApproval,
    },
    (event) => events.push(event),
  );
  sessions.push(session);
  const send = (content: string) =>
    session.sendMessage({ content, history: [] });
  return { events, send };
}

describe("AcpAgentAdapter over a real agent process", () => {
  it("resumes the same provider session in a fresh process after a crash", async () => {
    const { send } = startSession();

    await expect(send("hello")).resolves.toMatchObject({
      content: "new: hello",
    });
    await expect(send("crash")).rejects.toThrow(
      "Fake Agent stopped unexpectedly",
    );
    await expect(send("again")).resolves.toMatchObject({
      content: "resume fake-session: again",
    });
  });

  it("fails the turn instead of hanging when the agent exits cleanly", async () => {
    const { send } = startSession();

    await expect(send("exit-clean")).rejects.toThrow(
      "Fake Agent stopped unexpectedly",
    );
    await expect(send("back")).resolves.toMatchObject({
      content: "resume fake-session: back",
    });
  });

  it("reports a sign-in instruction for an auth-required error", async () => {
    const { events, send } = startSession();

    await expect(send("auth")).rejects.toThrow(
      "Fake Agent needs you to sign in",
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "state.changed", status: "error" }),
    );
  });

  it("routes the plan approval reverse-request to the user and back", async () => {
    const requestPlanApproval = vi.fn(async () => ({
      outcome: "approved" as const,
    }));
    const { send } = startSession({ requestPlanApproval });

    await expect(send("plan")).resolves.toMatchObject({
      content: "plan approved",
    });
    expect(requestPlanApproval).toHaveBeenCalledWith(
      expect.objectContaining({ id: "plan-tool", planContent: "Ship it" }),
    );
  });

  it("records both directions of the wire when tracing is enabled", async () => {
    const traceDir = await mkdtemp(path.join(tmpdir(), "cocurdex-acp-trace-"));
    vi.stubEnv(ACP_TRACE_DIR_ENV, traceDir);
    const { send } = startSession();

    await send("traced");

    const [traceFile] = await readdir(traceDir);
    const entries = (
      await readFile(path.join(traceDir, `${traceFile}`), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { direction: string; line: string });
    expect(entries).toContainEqual(
      expect.objectContaining({
        direction: "send",
        line: expect.stringContaining('"method":"session/prompt"'),
      }),
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        direction: "recv",
        line: expect.stringContaining("new: traced"),
      }),
    );
  });
});
