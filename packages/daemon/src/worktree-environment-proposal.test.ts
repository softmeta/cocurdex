import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAgentRegistry } from "@cocurdex/agent-core";
import type { SessionRecord, WorkspaceRecord } from "@cocurdex/shared";
import { isAssistantSessionId, sessionConfiguration } from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CocurdexDaemonService } from "./service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function createWorkspace(): WorkspaceRecord {
  return {
    id: "workspace-1",
    name: "Proposal test",
    rootPaths: ["/tmp/proposal-test"],
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
    lastOpenedAt: "2026-09-23T00:00:00.000Z",
    sortOrder: 1000,
  };
}

function createSession(): SessionRecord {
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    title: "Existing session",
    agentType: "pi",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
    lastMessageAt: null,
  };
}

async function createService() {
  const userDataPath = await mkdtemp(path.join(tmpdir(), "cocurdex-env-"));
  temporaryDirectories.push(userDataPath);
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "test",
    userDataPath,
  });
  const pi = createAgentRegistry()
    .list()
    .find((agent) => agent.id === "pi");
  if (!pi) throw new Error("Pi descriptor not found");
  vi.spyOn(service, "listAgents").mockResolvedValue([
    { ...pi, availability: "available" },
  ]);
  await service.saveWorkspace(createWorkspace());
  await service.saveSessionConfiguration(sessionConfiguration(createSession()));
  return service;
}

describe("worktree environment proposals", () => {
  it("stores a proposal without touching the saved scripts", async () => {
    const service = await createService();

    const proposed = await service.proposeWorktreeEnvironment({
      workspaceId: "workspace-1",
      setupScript: "pnpm install",
      cleanupScript: "rm -rf .turbo",
      rationale: "pnpm-lock.yaml detected",
    });
    expect(proposed.setupScript).toBe("");
    expect(proposed.proposal).toMatchObject({
      setupScript: "pnpm install",
      cleanupScript: "rm -rf .turbo",
      rationale: "pnpm-lock.yaml detected",
    });
  });

  it("clears a pending proposal when scripts are saved directly", async () => {
    const service = await createService();
    await service.proposeWorktreeEnvironment({
      workspaceId: "workspace-1",
      setupScript: "pnpm install",
      cleanupScript: "",
    });

    const saved = await service.saveWorktreeEnvironment({
      workspaceId: "workspace-1",
      setupScript: "yarn install",
      cleanupScript: "",
      updatedAt: null,
      proposal: null,
    });
    expect(saved.proposal).toBeNull();
  });
});

describe("settings set and pending changes", () => {
  it("queues renderer-owned values and drains them on ack", async () => {
    const service = await createService();

    const result = await service.setSettingValue({
      key: "app.theme",
      value: "dark",
      workspaceId: "workspace-1",
    });
    expect(result).toEqual({ status: "queued" });

    const pending = await service.listPendingSettingsChanges();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ key: "app.theme", value: "dark" });

    await service.acknowledgeSettingsChange(pending[0]!.id);
    expect(await service.listPendingSettingsChanges()).toEqual([]);
  });

  it("rejects invalid values and non-write tiers", async () => {
    const service = await createService();
    await expect(
      service.setSettingValue({
        key: "app.theme",
        value: "neon",
        workspaceId: "workspace-1",
      }),
    ).rejects.toThrow("app.theme");
    await expect(
      service.setSettingValue({
        key: "workspace.worktreeEnvironment",
        value: {},
        workspaceId: "workspace-1",
      }),
    ).rejects.toThrow("settings_propose");
    expect(await service.listPendingSettingsChanges()).toEqual([]);
  });

  it("applies daemon-owned values directly", async () => {
    const service = await createService();
    const result = await service.setSettingValue({
      key: "git.commitMessageModel",
      value: null,
      workspaceId: "workspace-1",
    });
    expect(result).toEqual({ status: "applied" });
    const read = await service.getSettingValue(
      "git.commitMessageModel",
      "workspace-1",
    );
    expect(read.value).toBeNull();
  });

  it("mirrors reported renderer values for settings_get", async () => {
    const service = await createService();
    await service.reportSettingValues({ "app.theme": "dark" });
    await service.reportSettingValues({ "app.language": "zh-CN" });

    const theme = await service.getSettingValue("app.theme", "workspace-1");
    expect(theme.value).toBe("dark");
    const language = await service.getSettingValue(
      "app.language",
      "workspace-1",
    );
    expect(language.value).toBe("zh-CN");
  });
});

describe("assistant session", () => {
  it("creates a read-only assistant session and returns it on repeat calls", async () => {
    const service = await createService();

    const session = await service.getOrCreateAssistantSession({
      workspaceId: "workspace-1",
    });
    if (!session) {
      throw new Error("expected assistant session");
    }
    expect(isAssistantSessionId(session.id)).toBe(true);
    expect(session.agentType).toBe("pi");
    expect(session.writeMode).toBe("read-only");
    expect(session.worktreePath ?? null).toBeNull();

    const again = await service.getOrCreateAssistantSession({
      workspaceId: "workspace-1",
    });
    expect(again?.id).toBe(session.id);
    expect(again?.createdAt).toBe(session.createdAt);
  });

  it("starts a new assistant session and reuses it afterwards", async () => {
    const service = await createService();
    const first = await service.getOrCreateAssistantSession({
      workspaceId: "workspace-1",
    });
    if (!first) {
      throw new Error("expected assistant session");
    }

    await new Promise((resolve) => setTimeout(resolve, 2));
    const created = await service.createAssistantSession("workspace-1");
    expect(isAssistantSessionId(created.id)).toBe(true);
    expect(created.id).not.toBe(first.id);
    expect(created.agentType).toBe(first.agentType);

    const reused = await service.getOrCreateAssistantSession({
      workspaceId: "workspace-1",
    });
    expect(reused?.id).toBe(created.id);
    expect((await service.getSession(first.id))?.archivedAt ?? null).toBeNull();
  });

  it("inherits the provider snapshot from the most recent same-agent session", async () => {
    const service = await createService();
    const providerSnapshot = {
      providerId: "provider-1",
      providerName: "Provider One",
      modelId: "model-1",
      modelName: "Model One",
      api: "openai-responses" as const,
      baseUrl: "https://provider.example",
    };
    await service.saveSessionConfiguration(
      sessionConfiguration({
        ...createSession(),
        id: "session-with-model",
        agentType: "pi",
        providerSnapshot,
        updatedAt: "2026-09-24T00:00:00.000Z",
      }),
    );

    const created = await service.getOrCreateAssistantSession({
      workspaceId: "workspace-1",
    });
    expect(created?.providerSnapshot).toMatchObject({
      providerId: "provider-1",
      modelId: "model-1",
    });
  });

  it("backfills the provider snapshot on an existing assistant session", async () => {
    const service = await createService();
    const created = await service.getOrCreateAssistantSession({
      workspaceId: "workspace-1",
    });
    expect(created?.providerSnapshot ?? null).toBeNull();

    const providerSnapshot = {
      providerId: "provider-1",
      providerName: "Provider One",
      modelId: "model-1",
      modelName: "Model One",
      api: "openai-responses" as const,
      baseUrl: "https://provider.example",
    };
    await service.saveSessionConfiguration(
      sessionConfiguration({
        ...createSession(),
        id: "session-with-model",
        agentType: "pi",
        providerSnapshot,
        updatedAt: "2026-09-24T00:00:00.000Z",
      }),
    );

    const backfilled = await service.getOrCreateAssistantSession({
      workspaceId: "workspace-1",
    });
    expect(backfilled?.id).toBe(created?.id);
    expect(backfilled?.providerSnapshot).toMatchObject({
      providerId: "provider-1",
      modelId: "model-1",
    });
  });
});
