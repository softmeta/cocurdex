import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import {
  type CocurdexDaemonEvent,
  PERSONAL_WORKSPACE_ID,
  personalAgentRoleDraft,
} from "@cocurdex/shared";
import { saveStubProvider } from "@cocurdex/test-harness/helpers/chat-session";
import {
  type DaemonProcess,
  spawnDaemon,
  waitFor,
} from "@cocurdex/test-harness/helpers/daemon-process";
import {
  type StubLlmServer,
  startStubLlmServer,
} from "@cocurdex/test-harness/helpers/llm-stub";
import { describe, expect, it } from "vitest";

function lastUserText(body: Record<string, unknown>) {
  const messages = body.messages as { role: string; content: unknown }[];
  const last = messages.filter((message) => message.role === "user").at(-1);
  return JSON.stringify(last?.content ?? "");
}

async function saveAgentModel(
  daemon: DaemonProcess,
  stub: StubLlmServer,
  modelId: string,
) {
  await saveStubProvider(daemon, stub);
  const now = new Date().toISOString();
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
      ).rejects.toMatchObject({ reason: "personalAgent.homeThread" });
      await expect(
        requestDaemon(
          "agentRole.delete",
          { id: assistant.role.id },
          daemon.options,
        ),
      ).rejects.toMatchObject({ reason: "personalAgent.roleDelete" });

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
      await saveAgentModel(daemon, stub, "e2e-agent-model");
      await saveAgentModel(daemon, stub, "e2e-other-model");
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
  it("answers inputs that arrive during a run together in one follow-up run", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      await saveAgentModel(daemon, stub, "e2e-agent-model");
      const assistant = await requestDaemon(
        "personalAgent.create",
        {
          role: {
            ...personalAgentRoleDraft("Inbox"),
            providerId: "e2e-stub",
            modelId: "e2e-agent-model",
            modelName: "e2e-agent-model",
          },
        },
        daemon.options,
      );
      const sessionId = assistant.homeSessionId;
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      let release = () => {};
      const firstRunHeld = new Promise<void>((resolve) => {
        release = resolve;
      });
      stub.plan = {
        kind: "script",
        turns: [
          { text: ["First answer", firstRunHeld] },
          { text: ["Both answered"] },
        ],
      };
      const send = (content: string, queue = false) =>
        requestDaemon(
          "session.send",
          {
            sessionId,
            messageId: crypto.randomUUID(),
            content,
            ...(queue ? { delivery: "queue-after-run" as const } : {}),
          },
          daemon.options,
        );

      await send("first question");
      await stub.nextRequest();
      await send("second question", true);
      await send("third question", true);
      release();

      const followUp = await stub.nextRequest();
      expect(lastUserText(followUp.body)).toContain("second question");
      expect(lastUserText(followUp.body)).toContain("third question");
      await waitFor(() =>
        events.some(
          (event) =>
            event.type === "message.completed" &&
            event.message.content === "Both answered",
        ),
      );
      expect(stub.requests).toHaveLength(2);
      subscription.close();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
  it("wakes an assistant in its home thread when its follow-up comes due", async () => {
    const stub = await startStubLlmServer();
    const daemon = await spawnDaemon();
    try {
      await saveAgentModel(daemon, stub, "e2e-agent-model");
      const assistant = await requestDaemon(
        "personalAgent.create",
        {
          role: {
            ...personalAgentRoleDraft("Follow-up"),
            providerId: "e2e-stub",
            modelId: "e2e-agent-model",
            modelName: "e2e-agent-model",
          },
        },
        daemon.options,
      );
      const events: CocurdexDaemonEvent[] = [];
      const subscription = await subscribeDaemonEvents(
        (event) => events.push(event),
        daemon.options,
      );
      stub.plan = { kind: "script", turns: [{ text: ["Checked the reply"] }] };
      const later = await requestDaemon(
        "followUp.create",
        {
          agentId: assistant.id,
          dueAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          note: "Never fires",
        },
        daemon.options,
      );
      await requestDaemon("followUp.cancel", { id: later.id }, daemon.options);
      const due = await requestDaemon(
        "followUp.create",
        {
          agentId: assistant.id,
          dueAt: new Date().toISOString(),
          note: "Check whether the landlord replied",
        },
        daemon.options,
      );

      const request = await stub.nextRequest();
      expect(lastUserText(request.body)).toContain(
        "Check whether the landlord replied",
      );
      await waitFor(() =>
        events.some(
          (event) =>
            event.type === "message.completed" &&
            event.message.content === "Checked the reply",
        ),
      );
      const followUps = await requestDaemon(
        "followUp.list",
        { agentId: assistant.id },
        daemon.options,
      );
      expect(
        followUps.map((followUp) => [followUp.id, followUp.status]),
      ).toEqual(
        expect.arrayContaining([
          [due.id, "fired"],
          [later.id, "canceled"],
        ]),
      );
      const { messages } = await requestDaemon(
        "session.listMessages",
        { sessionId: assistant.homeSessionId },
        daemon.options,
      );
      expect(
        messages.find((message) => message.origin?.kind === "followUp")?.role,
      ).toBe("user");
      expect(stub.requests).toHaveLength(1);
      subscription.close();
    } finally {
      await daemon.dispose();
      await stub.close();
    }
  });
});
