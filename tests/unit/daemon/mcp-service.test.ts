import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { DaemonMcpService } from "@cocurdex/daemon/internal/mcp-service";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
const fixtureServer = createRequire(import.meta.url).resolve(
  "./fixtures/mcp-stdio-server.mjs",
);

afterAll(() => tempDirs.cleanup());

async function createService(workspaceRoot: string | null = null) {
  const userDataPath = await tempDirs.create("cocurdex-mcp-");
  return new DaemonMcpService(userDataPath, async (workspaceId) =>
    workspaceId === "ws-1" ? workspaceRoot : null,
  );
}

const fixtureConfig = { command: process.execPath, args: [fixtureServer] };

describe("DaemonMcpService", () => {
  it("connects to saved servers and reports their tools", async () => {
    const service = await createService();
    await service.config.saveServer("fixture", fixtureConfig);
    await service.config.saveServer("off", {
      ...fixtureConfig,
      enabled: false,
    });

    const report = await service.status();

    expect(report.errors).toEqual([]);
    expect(report.servers).toEqual([
      expect.objectContaining({
        name: "fixture",
        scope: "global",
        state: "connected",
        tools: [{ name: "echo", description: "Echo the input back" }],
        error: null,
        oauth: false,
      }),
      expect.objectContaining({ name: "off", state: "disabled", tools: [] }),
    ]);
  });

  it("reports a hand-edited invalid server as failed with Pi's reason", async () => {
    const service = await createService();
    await mkdir(path.dirname(service.config.configPath), { recursive: true });
    await writeFile(
      service.config.configPath,
      JSON.stringify({
        mcpServers: { "server-1": { url: "npx" }, fixture: fixtureConfig },
      }),
    );

    const report = await service.status();

    expect(report.errors).toEqual([]);
    expect(report.servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "fixture", state: "connected" }),
        expect.objectContaining({
          name: "server-1",
          scope: "global",
          state: "failed",
          error: 'server "server-1": url must be an http or https URL',
        }),
      ]),
    );
    const named = await service.status(undefined, ["fixture"]);
    expect(named.servers.map((status) => status.name)).toEqual(["fixture"]);
  });

  it("reports a server that fails to start without saving anything", async () => {
    const service = await createService();
    const status = await service.test("broken", {
      command: process.execPath,
      args: ["-e", "process.exit(3)"],
    });

    expect(status.state).toBe("failed");
    expect(status.error).toBeTruthy();
    expect(await service.config.readServers()).toEqual({});
  });

  it("rejects configs Pi would reject, with Pi's message", async () => {
    const service = await createService();

    await expect(
      service.config.saveServer("sentry", {
        url: "https://mcp.sentry.dev/mcp",
        headers: { Authorization: 1 },
      }),
    ).rejects.toThrow('server "sentry": headers must map names to strings');
    await expect(
      service.config.saveConfig(
        '{"mcpServers":{"legacy":{"type":"sse","url":"https://example.invalid/sse"}}}',
      ),
    ).rejects.toThrow("legacy SSE transport is not supported");
    expect(await service.config.readServers()).toEqual({});
  });

  it("toggles, renames in place, and removes servers", async () => {
    const service = await createService();
    await service.config.saveServer("a", { command: "a" });
    await service.config.saveServer("b", { command: "b" });

    await service.config.setServerEnabled("a", false);
    expect((await service.config.readServers()).a).toEqual({
      command: "a",
      enabled: false,
    });
    await service.config.setServerEnabled("a", true);
    expect((await service.config.readServers()).a).toEqual({ command: "a" });

    await service.config.saveServer("a2", { command: "a2" }, "a");
    expect(Object.keys(await service.config.readServers())).toEqual([
      "a2",
      "b",
    ]);
    await expect(
      service.config.saveServer("b", { command: "b" }, "a2"),
    ).rejects.toThrow('"b" already exists');

    await service.config.removeServer("a2");
    expect(Object.keys(await service.config.readServers())).toEqual(["b"]);
  });

  it("reads a workspace's project config and includes it in status", async () => {
    const workspaceRoot = await tempDirs.create("cocurdex-mcp-ws-");
    await mkdir(path.join(workspaceRoot, ".pi"));
    const projectContent = JSON.stringify({
      mcpServers: { project: fixtureConfig },
    });
    await writeFile(
      path.join(workspaceRoot, ".pi", "mcp.json"),
      projectContent,
    );
    const service = await createService(workspaceRoot);

    const project = await service.readProjectConfig("ws-1");
    expect(project.content).toBe(projectContent);
    const report = await service.status("ws-1");
    expect(report.servers).toEqual([
      expect.objectContaining({
        name: "project",
        scope: "project",
        state: "connected",
      }),
    ]);
    await expect(service.readProjectConfig("missing")).rejects.toThrow(
      "Workspace not found",
    );
  });

  it("merges imported servers into the existing config", async () => {
    const service = await createService();
    await service.config.saveServer("keep", { command: "keep" });

    const saved = await service.config.mergeServers({
      added: { url: "https://example.invalid/mcp" },
    });

    expect(JSON.parse(saved.content).mcpServers).toEqual({
      keep: { command: "keep" },
      added: { url: "https://example.invalid/mcp" },
    });
    expect(await readFile(saved.path, "utf8")).toBe(saved.content);
  });
});

describe("DaemonMcpService agent targets", () => {
  async function createTargetService() {
    const userDataPath = await tempDirs.create("cocurdex-mcp-");
    return new DaemonMcpService(userDataPath, async () => null, {
      DOCS_TOKEN: "secret",
    });
  }

  it("injects only enabled servers that target the agent", async () => {
    const service = await createTargetService();
    await service.config.saveServer("pi-only", { command: "a" });
    await service.config.saveServer("docs", {
      url: "https://docs.example.invalid/mcp",
      headers: { Authorization: "Bearer ${DOCS_TOKEN}" },
    });
    await service.config.setServerAgents("docs", ["pi", "claude-agent"]);
    await service.config.saveServer("off", {
      command: "b",
      enabled: false,
      cocurdex: { agents: ["claude-agent"] },
    });

    expect(await service.serversForAgent("claude-agent")).toEqual([
      {
        transport: "http",
        name: "docs",
        url: "https://docs.example.invalid/mcp",
        headers: { Authorization: "Bearer secret" },
      },
    ]);
    expect(await service.serversForAgent("codex")).toEqual([]);
    expect(await service.serversForAgent("opencode")).toEqual([]);
    expect(await service.serversForAgent("pi")).toEqual([]);
  });

  it("keeps the rest of the server when its agents change", async () => {
    const service = await createTargetService();
    await service.config.saveServer("local", { command: "a", args: ["x"] });
    await service.config.setServerAgents("local", ["codex"]);
    expect((await service.config.readServers()).local).toEqual({
      command: "a",
      args: ["x"],
      cocurdex: { agents: ["codex"] },
    });
    await expect(
      service.config.setServerAgents("missing", ["codex"]),
    ).rejects.toThrow('No MCP server named "missing"');
  });

  it("explains which servers other agents cannot receive", async () => {
    const service = await createTargetService();
    await service.config.saveServer("ok", { command: "a" });
    await service.config.saveServer("secret", {
      command: "a",
      env: { KEY: "!op read item" },
    });
    await service.config.saveServer("missing", {
      url: "https://m.example.invalid/mcp",
      headers: { X: "${NOT_SET}" },
    });
    expect(await service.injectionSupport()).toEqual({
      ok: null,
      secret: "command-value",
      missing: "missing-env",
    });
  });
});
