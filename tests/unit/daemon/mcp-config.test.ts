import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DaemonMcpConfigService,
  getMcpConfigPath,
  validateMcpConfig,
} from "@cocurdex/daemon/internal/mcp-config";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

describe("MCP configuration", () => {
  it("stores validated config in Cocurdex-owned Pi state", async () => {
    const userDataPath = await tempDirs.create("cocurdex-mcp-");
    const service = new DaemonMcpConfigService(userDataPath);
    const saved = await service.saveConfig(
      '{"mcpServers":{"local":{"command":"node","args":["server.js"]}}}',
    );

    expect(saved.path).toBe(path.join(userDataPath, "pi-agent", "mcp.json"));
    expect(await service.readConfig()).toEqual(saved);
    expect(await readFile(saved.path, "utf8")).toBe(saved.content);
    expect(getMcpConfigPath(userDataPath)).not.toContain(".pi/agent");
  });

  it("rejects config without an mcpServers object", () => {
    expect(() => validateMcpConfig("{}")).toThrow('"mcpServers" object');
  });

  it("rejects server names Pi cannot turn into tool names", () => {
    expect(() =>
      validateMcpConfig('{"mcpServers":{"my server":{"command":"npx"}}}'),
    ).toThrow('"my server"');
    expect(
      validateMcpConfig('{"mcpServers":{"git_hub-2":{"command":"npx"}}}'),
    ).toContain("git_hub-2");
  });

  it("keeps concurrent saves intact and in request order", async () => {
    const userDataPath = await tempDirs.create("cocurdex-mcp-");
    const service = new DaemonMcpConfigService(userDataPath);

    const [first, second] = await Promise.all([
      service.saveConfig('{"mcpServers":{"a":{"command":"a"}}}'),
      service.saveConfig('{"mcpServers":{"b":{"command":"b"}}}'),
    ]);

    expect(first.content).toContain('"a"');
    expect(second.content).toContain('"b"');
    expect(await service.readConfig()).toEqual(second);
  });
});

describe("MCP server agent targets", () => {
  it("keeps a server's agents when an edit does not mention them", async () => {
    const userDataPath = await tempDirs.create("cocurdex-mcp-");
    const service = new DaemonMcpConfigService(userDataPath);
    await service.saveServer("local", { command: "a" });
    await service.setServerAgents("local", ["pi", "codex"]);
    await service.saveServer("renamed", { command: "b" }, "local");
    expect((await service.readServers()).renamed).toEqual({
      command: "b",
      cocurdex: { agents: ["pi", "codex"] },
    });
  });
});
