import { handleDaemonRequest } from "@cocurdex/daemon/internal/handler";
import { CocurdexDaemonService } from "@cocurdex/daemon/internal/service";
import type { DaemonRequest } from "@cocurdex/rpc";
import {
  type AgentProviderSnapshot,
  CHAT_WORKSPACE_ID,
  createProviderSnapshotForModel,
  type HostPrincipal,
  type ProviderConfigRecord,
  type ProviderModelRecord,
  type SessionConfiguration,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

const now = "2026-10-25T00:00:00.000Z";
const device: HostPrincipal = {
  kind: "device",
  deviceId: "phone-1",
  scopes: ["read", "interact", "execute"],
};

function provider(id: string, key: string): ProviderConfigRecord {
  return {
    id,
    name: id,
    baseUrl: `http://127.0.0.1:9/${id}`,
    enabled: true,
    apiKeySecretId: null,
    headersJson: JSON.stringify({ Authorization: `Bearer ${key}` }),
    createdAt: now,
    updatedAt: now,
  };
}

function model(providerId: string): ProviderModelRecord {
  return {
    providerId,
    modelId: `${providerId}-model`,
    name: `${providerId} model`,
    api: "openai-completions",
    enabled: true,
    source: "manual",
    capabilities: ["chat"],
    createdAt: now,
    updatedAt: now,
  };
}

function configuration(
  providerSnapshot: AgentProviderSnapshot,
): SessionConfiguration {
  return {
    id: "session-1",
    workspaceId: CHAT_WORKSPACE_ID,
    sessionKind: "chat",
    title: "Chat",
    agentType: "pi",
    writeMode: "read-only",
    sessionModeId: null,
    providerSnapshot,
  };
}

async function setup() {
  const service = new CocurdexDaemonService({
    runtimeFingerprint: "configure-headers-test",
    userDataPath: tempDirs.createSync("configure-headers-"),
  });
  tempDirs.onCleanup(() => service.shutdown());
  const snapshots = new Map<string, AgentProviderSnapshot>();
  for (const [id, key] of [
    ["gateway", "sk-gateway"],
    ["backup", "sk-backup"],
  ] as const) {
    const config = provider(id, key);
    await service.providerService.saveProviderConfig(config);
    await service.providerService.saveProviderModel(model(id));
    snapshots.set(
      id,
      createProviderSnapshotForModel({ provider: config, model: model(id) }),
    );
  }
  const configure = (input: SessionConfiguration, principal = device) =>
    handleDaemonRequest<"session.configure">(
      service,
      {
        id: "1",
        method: "session.configure",
        params: input,
        token: "test",
      } as DaemonRequest<"session.configure">,
      { principal, remoteAddress: "10.0.0.2" },
    );
  const storedHeaders = async () =>
    (await service.getSession("session-1"))?.providerSnapshot?.headersJson;
  const snapshot = (id: string) => {
    const found = snapshots.get(id);
    if (!found) throw new Error(`Missing ${id}`);
    return found;
  };
  return { service, configure, storedHeaders, snapshot };
}

describe("session.configure from a device without credentials access", () => {
  it("keeps the stored provider headers the device never received", async () => {
    const { service, configure, storedHeaders, snapshot } = await setup();
    await service.saveSessionConfiguration(configuration(snapshot("gateway")));

    await configure(
      configuration({
        ...snapshot("gateway"),
        headersJson: null,
        thinkingLevel: "high",
      }),
    );

    expect(await storedHeaders()).toContain("sk-gateway");
    expect(
      (await service.getSession("session-1"))?.providerSnapshot?.thinkingLevel,
    ).toBe("high");
  });

  it("takes connection fields from the provider config, not the device", async () => {
    const { service, configure, storedHeaders, snapshot } = await setup();
    await service.saveSessionConfiguration(configuration(snapshot("gateway")));

    await configure(
      configuration({
        ...snapshot("backup"),
        baseUrl: "https://attacker.example.invalid/v1",
        modelBaseUrl: "https://attacker.example.invalid/v1",
        headersJson: JSON.stringify({ Authorization: "Bearer forged" }),
      }),
    );

    expect(await storedHeaders()).toContain("sk-backup");
    expect(
      (await service.getSession("session-1"))?.providerSnapshot,
    ).toMatchObject({
      providerId: "backup",
      baseUrl: "http://127.0.0.1:9/backup",
      modelBaseUrl: null,
    });
  });
});
