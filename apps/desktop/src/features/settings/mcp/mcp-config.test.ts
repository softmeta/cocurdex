import { describe, expect, it } from "vitest";
import {
  configToServerForms,
  createMcpServerName,
  parseMcpConfig,
  serializeServerForms,
} from "./mcp-config";

describe("MCP form configuration", () => {
  it("round-trips advanced fields while editing common fields", () => {
    const config = parseMcpConfig(
      JSON.stringify({
        settings: { toolPrefix: "short" },
        mcpServers: {
          github: {
            command: "npx",
            args: ["-y", "server"],
            directTools: true,
          },
        },
      }),
    );
    const forms = configToServerForms(config);
    forms[0].target = "pnpm";

    const result = JSON.parse(serializeServerForms(config, forms));
    expect(result.settings).toEqual({ toolPrefix: "short" });
    expect(result.mcpServers.github).toMatchObject({
      command: "pnpm",
      directTools: true,
    });
  });

  it("rejects duplicate names and creates a free default name", () => {
    const config = parseMcpConfig('{"mcpServers":{}}');
    const forms = configToServerForms(config);
    forms.push({
      args: "",
      env: "",
      id: "server-1",
      name: "server-1",
      raw: {},
      target: "npx",
      transport: "stdio",
    });
    expect(createMcpServerName(forms)).toBe("server-2");
    expect(() => serializeServerForms(config, [...forms, forms[0]])).toThrow(
      "unique",
    );
  });
});
