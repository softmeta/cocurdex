import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();

const now = "2026-08-15T00:00:00.000Z";

afterEach(async () => {
  await tempDirs.cleanup();
});

async function createService() {
  const userDataPath = await tempDirs.create("cocurdex-session-title-");
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "session-title-test",
    userDataPath,
  });
  const workspace = {
    id: "workspace-1",
    name: "Title workspace",
    rootPaths: ["/tmp/title-workspace"],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 1000,
  } satisfies WorkspaceRecord;
  const session = {
    id: "session-1",
    workspaceId: workspace.id,
    title: "Local fallback",
    agentType: "opencode",
    status: "running",
    writeMode: "native-write",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
  } satisfies SessionRecord;
  await service.saveWorkspace(workspace);
  await service.state.saveSession(session);
  return service;
}

describe("DaemonState native session titles", () => {
  it("persists matching native titles without overwriting a manual rename", async () => {
    const service = await createService();

    await service.state.persistAgentEvent({
      type: "session.title.updated",
      sessionId: "session-1",
      title: "Native title",
      expectedTitle: "Local fallback",
      updatedAt: "2026-08-15T00:00:01.000Z",
    });
    await expect(service.state.getSession("session-1")).resolves.toMatchObject({
      title: "Native title",
    });

    await service.state.updateSessionTitle("session-1", "Manual title");
    await service.state.persistAgentEvent({
      type: "session.title.updated",
      sessionId: "session-1",
      title: "Later native title",
      expectedTitle: "Native title",
      updatedAt: "2026-08-15T00:00:02.000Z",
    });
    await expect(service.state.getSession("session-1")).resolves.toMatchObject({
      title: "Manual title",
    });

    await service.shutdown();
  });

  it("forwards accepted Cocurdex title changes to the active runtime", async () => {
    const service = await createService();
    const setSessionTitle = vi
      .spyOn(service.runtime, "setSessionTitle")
      .mockResolvedValue();

    await expect(
      service.updateSessionTitle({
        sessionId: "session-1",
        title: "Generated title",
        expectedTitle: "Local fallback",
      }),
    ).resolves.toMatchObject({ title: "Generated title" });
    expect(setSessionTitle).toHaveBeenCalledWith(
      "session-1",
      "Generated title",
    );

    await expect(
      service.updateSessionTitle({
        sessionId: "session-1",
        title: "Stale generated title",
        expectedTitle: "Local fallback",
      }),
    ).resolves.toMatchObject({ title: "Generated title" });
    expect(setSessionTitle).toHaveBeenCalledOnce();

    await service.shutdown();
  });

  it("accepts only one concurrent title update for the same expected title", async () => {
    const service = await createService();
    const setSessionTitle = vi
      .spyOn(service.runtime, "setSessionTitle")
      .mockResolvedValue();

    const results = await Promise.all([
      service.updateSessionTitle({
        sessionId: "session-1",
        title: "First generated title",
        expectedTitle: "Local fallback",
      }),
      service.updateSessionTitle({
        sessionId: "session-1",
        title: "Second generated title",
        expectedTitle: "Local fallback",
      }),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ title: "First generated title" }),
      expect.objectContaining({ title: "First generated title" }),
    ]);
    expect(setSessionTitle).toHaveBeenCalledOnce();
    expect(setSessionTitle).toHaveBeenCalledWith(
      "session-1",
      "First generated title",
    );

    await service.shutdown();
  });
});
