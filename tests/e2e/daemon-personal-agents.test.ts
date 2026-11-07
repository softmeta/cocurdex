import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import {
  type CocurdexDaemonEvent,
  PERSONAL_WORKSPACE_ID,
  personalAgentRoleDraft,
} from "@cocurdex/shared";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import {
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { describe, expect, it } from "vitest";

function personalChanges(events: CocurdexDaemonEvent[]) {
  return events.filter(
    (event) =>
      event.type === "data.changed" && event.areas.includes("personal"),
  ).length;
}

describe("personal agents over the daemon socket", () => {
  it("keeps each agent's role and home thread in the personal workspace", async () => {
    const daemon = await spawnDaemon();
    try {
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      const assistant = await requestDaemon(
        "personalAgent.create",
        { role: personalAgentRoleDraft("助理") },
        daemon.options,
      );
      const home = await requestDaemon(
        "session.get",
        { sessionId: assistant.homeSessionId },
        daemon.options,
      );
      expect(home).toMatchObject({
        workspaceId: PERSONAL_WORKSPACE_ID,
        sessionKind: "personal",
        agentRoleId: assistant.role.id,
        title: "助理",
      });
      const workspaces = await requestDaemon("workspace.list", daemon.options);
      expect(
        workspaces.some((workspace) => workspace.id === PERSONAL_WORKSPACE_ID),
      ).toBe(true);

      await expect(
        requestDaemon(
          "session.delete",
          { sessionId: assistant.homeSessionId },
          daemon.options,
        ),
      ).rejects.toThrow("home thread");
      await expect(
        requestDaemon(
          "agentRole.delete",
          { id: assistant.role.id },
          daemon.options,
        ),
      ).rejects.toThrow("personal agent");

      const coach = await requestDaemon(
        "personalAgent.create",
        {
          role: { ...assistant.role, name: "Coach" },
          soul: "Short answers",
        },
        daemon.options,
      );
      expect(
        (await requestDaemon("personalAgent.list", daemon.options)).map(
          (agent) => agent.role.name,
        ),
      ).toEqual(["助理", "Coach"]);

      await requestDaemon(
        "personalAgent.delete",
        { id: coach.id },
        daemon.options,
      );
      expect(
        await requestDaemon(
          "session.get",
          { sessionId: coach.homeSessionId },
          daemon.options,
        ),
      ).toBeNull();
      expect(
        await requestDaemon(
          "agentRole.get",
          { id: coach.role.id },
          daemon.options,
        ),
      ).toBeNull();
      await waitFor(() => personalChanges(events) >= 3);
      subscription.close();
    } finally {
      await daemon.dispose();
    }
  });

  it("moves an existing home thread to the model its persona switches to", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      await saveStubProvider(daemon, stub);
      const now = new Date().toISOString();
      for (const modelId of ["e2e-agent-model", "e2e-other-model"]) {
        await requestDaemon(
          "provider.model.save",
          {
            model: {
              providerId: "e2e-stub",
              modelId,
              name: modelId,
              api: "openai-completions",
              enabled: true,
              source: "manual",
              capabilities: ["chat", "agent"],
              createdAt: now,
              updatedAt: now,
            },
          },
          daemon.options,
        );
      }
      const assistant = await requestDaemon(
        "personalAgent.create",
        {
          role: {
            name: "Coach",
            agentId: "pi",
            providerId: "e2e-stub",
            modelId: "e2e-agent-model",
            modelName: "e2e-agent-model",
            permissionMode: null,
            sessionModeId: null,
            reasoningEffort: null,
            serviceTier: null,
            fastMode: null,
            thinkingLevel: null,
            openCodeAgent: null,
            openCodeVariant: null,
          },
        },
        daemon.options,
      );
      const before = await requestDaemon(
        "session.get",
        { sessionId: assistant.homeSessionId },
        daemon.options,
      );
      expect(before?.providerSnapshot?.modelId).toBe("e2e-agent-model");
      const {
        id: _id,
        createdAt: _created,
        updatedAt: _updated,
        ...role
      } = assistant.role;
      await requestDaemon(
        "personalAgent.update",
        {
          id: assistant.id,
          role: {
            ...role,
            modelId: "e2e-other-model",
            modelName: "e2e-other-model",
          },
        },
        daemon.options,
      );
      const home = await requestDaemon(
        "session.get",
        { sessionId: assistant.homeSessionId },
        daemon.options,
      );
      expect(home?.providerSnapshot).toMatchObject({
        providerId: "e2e-stub",
        modelId: "e2e-other-model",
      });
      await requestDaemon(
        "agentRole.save",
        {
          ...role,
          id: assistant.role.id,
          name: "Explorer",
          modelId: "e2e-agent-model",
          modelName: "e2e-agent-model",
        },
        daemon.options,
      );
      const renamed = await requestDaemon(
        "session.get",
        { sessionId: assistant.homeSessionId },
        daemon.options,
      );
      expect(renamed?.title).toBe("Explorer");
      expect(renamed?.providerSnapshot?.modelId).toBe("e2e-agent-model");
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
