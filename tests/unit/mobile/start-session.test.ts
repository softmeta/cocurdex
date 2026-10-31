import {
  createSessionStarter,
  type StartConnection,
  shownSessionPayload,
} from "@cocurdex/mobile/internal/new-session/start-session";
import type { ImageAttachment, SessionRecord } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";

const now = "2026-10-25T00:00:00.000Z";

function session(id: string): SessionRecord {
  return {
    id,
    workspaceId: "workspace-1",
    title: "Review totals",
    agentType: "pi",
    status: "idle",
    writeMode: "native-write",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  };
}

function fakeConnection(sendFailures: number) {
  let created = 0;
  let failures = sendFailures;
  const request = vi.fn(async (method: string) => {
    if (method === "session.create") {
      created += 1;
      return session(`session-${created}`);
    }
    return undefined;
  });
  const command = vi.fn(async () => {
    if (failures > 0) {
      failures -= 1;
      throw new Error("offline");
    }
    return undefined;
  });
  return {
    connection: { request, command } as unknown as StartConnection,
    request,
    command,
  };
}

const request = {
  payload: { workspaceId: "workspace-1", agentType: "pi" as const },
  prompt: "Review the checkout totals",
  attachments: [],
  fallbackTitle: "Pi",
};

const screenshot: ImageAttachment = {
  kind: "image",
  id: "image-1",
  name: "cart.png",
  mimeType: "image/png",
  sizeBytes: 1024,
  filePath: "/attachments/cart.png",
  width: 640,
  height: 480,
};

describe("createSessionStarter", () => {
  it("retries a failed send into the session it already created", async () => {
    const fake = fakeConnection(1);
    const start = createSessionStarter(fake.connection);

    await expect(start(request)).rejects.toThrow("offline");
    const started = await start(request);

    const creates = fake.request.mock.calls.filter(
      ([method]) => method === "session.create",
    );
    expect(creates).toHaveLength(1);
    expect(started.session.id).toBe("session-1");
    const sends = fake.command.mock.calls as unknown as [
      string,
      { sessionId: string; messageId: string },
      { idempotencyKey: string },
    ][];
    expect(sends).toHaveLength(2);
    expect(sends[1]?.[1]).toMatchObject({
      sessionId: "session-1",
      messageId: sends[0]?.[1].messageId,
    });
    expect(sends[1]?.[2].idempotencyKey).toBe(sends[0]?.[1].messageId);
    expect(started.messageId).toBe(sends[1]?.[1].messageId);
  });

  it("creates a new session once the request changes after a failed send", async () => {
    const fake = fakeConnection(1);
    const start = createSessionStarter(fake.connection);

    await expect(start(request)).rejects.toThrow("offline");
    const started = await start({ ...request, prompt: "Review tax rules" });

    expect(started.session.id).toBe("session-2");
  });

  it("sends the picked images with the first message", async () => {
    const fake = fakeConnection(0);
    const start = createSessionStarter(fake.connection);

    await start({ ...request, attachments: [screenshot] });

    expect(fake.command.mock.calls[0]).toEqual([
      "session.send",
      expect.objectContaining({ attachments: [screenshot] }),
      expect.anything(),
    ]);
  });
});

describe("shownSessionPayload", () => {
  it("starts with the agent, model, and mode the form shows", () => {
    expect(
      shownSessionPayload("workspace-2", {
        agentType: "claude-agent",
        model: {
          providerId: "anthropic",
          modelId: "claude-sonnet",
          name: "Claude Sonnet",
        },
        permissionMode: "claude-default",
        permissionModes: ["claude-auto", "claude-default"],
      }),
    ).toEqual({
      workspaceId: "workspace-2",
      agentType: "claude-agent",
      model: { providerId: "anthropic", modelId: "claude-sonnet" },
      permissionMode: "claude-default",
      agentRoleId: null,
    });
  });

  it("records the role the session starts as", () => {
    expect(
      shownSessionPayload(
        "workspace-2",
        {
          agentType: "claude-agent",
          model: null,
          permissionMode: null,
          permissionModes: [],
        },
        "role-reviewer",
      ),
    ).toMatchObject({
      agentType: "claude-agent",
      agentRoleId: "role-reviewer",
    });
  });
});
