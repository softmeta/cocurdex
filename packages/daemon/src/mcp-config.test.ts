import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DaemonMcpConfigService,
  getMcpConfigPath,
  validateMcpConfig,
} from "./mcp-config";

describe("MCP configuration", () => {
  it("stores validated config in Cocurdex-owned Pi state", async () => {
    const userDataPath = await mkdtemp(path.join(tmpdir(), "cocurdex-mcp-"));
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

  it("keeps concurrent saves intact and in request order", async () => {
    const userDataPath = await mkdtemp(path.join(tmpdir(), "cocurdex-mcp-"));
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
