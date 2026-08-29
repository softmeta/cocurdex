import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getMcpConfigPath,
  readMcpConfig,
  saveMcpConfig,
  validateMcpConfig,
} from "./mcp-service";

describe("MCP configuration", () => {
  it("stores validated config in Cocurdex-owned Pi state", async () => {
    const userDataPath = await mkdtemp(path.join(tmpdir(), "cocurdex-mcp-"));
    const saved = await saveMcpConfig(
      '{"mcpServers":{"local":{"command":"node","args":["server.js"]}}}',
      userDataPath,
    );

    expect(saved.path).toBe(path.join(userDataPath, "pi-agent", "mcp.json"));
    expect(await readMcpConfig(userDataPath)).toEqual(saved);
    expect(await readFile(saved.path, "utf8")).toBe(saved.content);
    expect(getMcpConfigPath(userDataPath)).not.toContain(".pi/agent");
  });

  it("rejects config without an mcpServers object", () => {
    expect(() => validateMcpConfig("{}")).toThrow('"mcpServers" object');
  });
});
