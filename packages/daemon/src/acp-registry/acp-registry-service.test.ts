import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createAgentRegistry,
  setInstalledAcpRegistryAgents,
} from "@cocurdex/agent-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcpRegistryEntry } from "./acp-registry-catalog";
import { resolveInstalledCommand } from "./acp-registry-install";
import {
  ACP_REGISTRY_AGENTS_SETTING_KEY,
  AcpRegistryService,
} from "./acp-registry-service";

const noLocalCli = async () => null;

function localGrok(registryId: string) {
  return Promise.resolve(
    registryId === "grok-build"
      ? {
          agentId: "acp:grok-build" as const,
          registryId,
          name: "Grok Build",
          version: "",
          description: null,
          distribution: "local" as const,
          command: "/usr/local/bin/grok",
          args: ["agent", "stdio"],
          env: {},
          installedAt: "2026-10-05T00:00:00.000Z",
        }
      : null,
  );
}

function memorySettings() {
  const values = new Map<string, string>();
  return {
    values,
    getAppSetting: async (key: string) => values.get(key) ?? null,
    setAppSetting: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function binaryEntry(archive: string, sha256: string | null): AcpRegistryEntry {
  return {
    agent: {
      registryId: "demo",
      name: "Demo",
      version: "1.0.0",
      description: null,
      repository: null,
      website: null,
      iconUrl: null,
      distribution: "binary",
      builtInAgentId: null,
    },
    launch: {
      kind: "binary",
      target: {
        archive,
        cmd: "./bin/demo",
        args: ["acp"],
        env: { DEMO_MODE: "1" },
        sha256,
      },
    },
  };
}

describe("AcpRegistryService", () => {
  let userDataPath: string;
  let server: Server;
  let archiveUrl: string;
  let archiveSha: string;

  beforeEach(async () => {
    userDataPath = await mkdtemp(path.join(tmpdir(), "cocurdex-acp-registry-"));
    const source = path.join(userDataPath, "source");
    await mkdir(path.join(source, "bin"), { recursive: true });
    await writeFile(path.join(source, "bin", "demo"), "#!/bin/sh\n");
    const archive = path.join(userDataPath, "demo.tar.gz");
    execFileSync("tar", ["-czf", archive, "-C", source, "bin"]);
    const bytes = await readFile(archive);
    archiveSha = createHash("sha256").update(bytes).digest("hex");
    server = createServer((_request, response) => response.end(bytes));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    archiveUrl = `http://127.0.0.1:${port}/demo.tar.gz`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    setInstalledAcpRegistryAgents([]);
  });

  it("installs a verified binary, persists it, and exposes it as an agent", async () => {
    const settings = memorySettings();
    const service = new AcpRegistryService(
      settings,
      userDataPath,
      async () => [binaryEntry(archiveUrl, archiveSha)],
      noLocalCli,
    );

    const installed = await service.install("demo");

    expect(installed).toMatchObject({
      agentId: "acp:demo",
      args: ["acp"],
      env: { DEMO_MODE: "1" },
      command: path.join(
        userDataPath,
        "acp-agents",
        "demo",
        "1.0.0",
        "bin",
        "demo",
      ),
    });
    expect(
      JSON.parse(settings.values.get(ACP_REGISTRY_AGENTS_SETTING_KEY) ?? "[]"),
    ).toHaveLength(1);
    expect(
      createAgentRegistry()
        .list()
        .map((agent) => agent.id),
    ).toContain("acp:demo");

    const restarted = new AcpRegistryService(
      settings,
      userDataPath,
      undefined,
      noLocalCli,
    );
    await restarted.ready;
    expect(restarted.listInstalled().map((agent) => agent.agentId)).toEqual([
      "acp:demo",
    ]);

    await restarted.uninstall("acp:demo");
    expect(
      createAgentRegistry()
        .list()
        .map((agent) => agent.id),
    ).not.toContain("acp:demo");
    expect(settings.values.get(ACP_REGISTRY_AGENTS_SETTING_KEY)).toBe("[]");
  });

  it("refuses an archive whose checksum does not match", async () => {
    const settings = memorySettings();
    const service = new AcpRegistryService(
      settings,
      userDataPath,
      async () => [binaryEntry(archiveUrl, "0".repeat(64))],
      noLocalCli,
    );

    await expect(service.install("demo")).rejects.toThrow(/Checksum/);
    expect(service.listInstalled()).toEqual([]);
  });

  it("adopts a local CLI once and respects a later removal", async () => {
    const settings = memorySettings();
    const service = new AcpRegistryService(
      settings,
      userDataPath,
      async () => [],
      localGrok,
    );
    await service.ready;
    expect(service.listInstalled()).toMatchObject([
      { agentId: "acp:grok-build", command: "/usr/local/bin/grok" },
    ]);

    await service.uninstall("acp:grok-build");
    const restarted = new AcpRegistryService(
      settings,
      userDataPath,
      async () => [],
      localGrok,
    );
    await restarted.ready;
    expect(restarted.listInstalled()).toEqual([]);
  });

  it("prefers the local CLI over a download and refuses built-in duplicates", async () => {
    const settings = memorySettings();
    settings.values.set(
      "acpRegistry.adoptedLocalClis",
      JSON.stringify(["grok-build"]),
    );
    const fetchCatalog = vi.fn(async () => [
      {
        ...binaryEntry(archiveUrl, archiveSha),
        agent: {
          ...binaryEntry(archiveUrl, archiveSha).agent,
          registryId: "codex-acp",
          builtInAgentId: "codex" as const,
        },
      },
    ]);
    const service = new AcpRegistryService(
      settings,
      userDataPath,
      fetchCatalog,
      localGrok,
    );

    await expect(service.install("grok-build")).resolves.toMatchObject({
      distribution: "local",
    });
    expect(fetchCatalog).not.toHaveBeenCalled();
    await expect(service.install("codex-acp")).rejects.toThrow(/built in/);
  });

  it("ignores corrupt persisted state", async () => {
    const settings = memorySettings();
    settings.values.set(ACP_REGISTRY_AGENTS_SETTING_KEY, "{not json");
    const service = new AcpRegistryService(
      settings,
      userDataPath,
      undefined,
      noLocalCli,
    );
    await service.ready;
    expect(service.listInstalled()).toEqual([]);
  });
});

describe("resolveInstalledCommand", () => {
  it("keeps the command inside the install directory", () => {
    expect(() =>
      resolveInstalledCommand("/agents/demo", "../../bin/sh"),
    ).toThrow();
    expect(resolveInstalledCommand("/agents/demo", "./demo")).toBe(
      "/agents/demo/demo",
    );
  });
});
