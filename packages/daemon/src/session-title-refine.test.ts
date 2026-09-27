import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAgentRegistry } from "@cocurdex/agent-core";
import { sessionConfiguration } from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CocurdexDaemonService } from "./service";

const generateProviderSessionTitleMock = vi.hoisted(() => vi.fn());

vi.mock("./provider/session-title", () => ({
  generateProviderSessionTitle: generateProviderSessionTitleMock,
}));

const now = "2026-08-02T00:00:00.000Z";
const services: { service: CocurdexDaemonService; userDataPath: string }[] = [];

afterEach(async () => {
  vi.clearAllMocks();
  for (const { service, userDataPath } of services.splice(0)) {
    await service.shutdown();
    await rm(userDataPath, { force: true, recursive: true });
  }
});

async function createService() {
  const userDataPath = await mkdtemp(path.join(tmpdir(), "cocurdex-title-"));
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "test",
    userDataPath,
  });
  services.push({ service, userDataPath });
  const pi = createAgentRegistry()
    .list()
    .find((agent) => agent.id === "pi");
  if (!pi) throw new Error("Pi descriptor not found");
  vi.spyOn(service, "listAgents").mockResolvedValue([
    { ...pi, availability: "available" },
  ]);
  await service.saveWorkspace({
    id: "workspace-1",
    name: "Title test",
    rootPaths: ["/tmp/title-test"],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  });
  await service.saveSessionConfiguration(
    sessionConfiguration({
      id: "session-1",
      workspaceId: "workspace-1",
      title: "Draft title",
      agentType: "pi",
      status: "idle",
      writeMode: "read-only",
      sessionModeId: null,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: null,
    }),
  );
  return service;
}

const refine = {
  sessionId: "session-1",
  message: "Fix the reconnect loop",
  fallbackTitle: "Draft title",
  expectedTitle: "Draft title",
};

describe("refineSessionTitle", () => {
  it("replaces the expected title with the generated one", async () => {
    const service = await createService();
    generateProviderSessionTitleMock.mockResolvedValue("Fix reconnect loop");

    const session = await service.refineSessionTitle(refine);

    expect(session?.title).toBe("Fix reconnect loop");
  });

  it("keeps a title the user renamed while generation was pending", async () => {
    const service = await createService();
    generateProviderSessionTitleMock.mockResolvedValue("Fix reconnect loop");

    const session = await service.refineSessionTitle({
      ...refine,
      expectedTitle: "Something else",
    });

    expect(session?.title).toBe("Draft title");
    expect(generateProviderSessionTitleMock).not.toHaveBeenCalled();
  });

  it("keeps the current title when generation yields nothing", async () => {
    const service = await createService();
    generateProviderSessionTitleMock.mockResolvedValue(null);

    const session = await service.refineSessionTitle(refine);

    expect(session?.title).toBe("Draft title");
  });
});
