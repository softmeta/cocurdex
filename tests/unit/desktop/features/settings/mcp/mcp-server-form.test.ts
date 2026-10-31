import { describe, expect, it } from "vitest";
import {
  joinArgs,
  serverConfigToForm,
  serverFormToConfig,
  splitArgs,
  validateServerForm,
} from "@/features/settings/mcp/mcp-server-form";

function roundTrip(config: Record<string, unknown>) {
  return serverFormToConfig(serverConfigToForm("s", config), config);
}

describe("MCP server form", () => {
  it("round-trips configs, keeping fields the form does not edit", () => {
    const stdio = {
      command: "npx",
      args: ["-y", "@scope/server", "--root", "My Files"],
      env: { TOKEN: "${TOKEN}" },
      cwd: "/srv",
      timeout: 30,
      exposure: "direct",
      toolExposure: { search: "hidden" },
      enabled: false,
    };
    expect(roundTrip(stdio)).toEqual(stdio);

    const http = {
      url: "https://mcp.example.invalid/mcp",
      headers: { "X-Team": "core", Authorization: "Bearer ${GITHUB_TOKEN}" },
      oauth: { clientId: "id", scope: "read" },
      auth: { provider: "openai" },
    };
    expect(roundTrip(http)).toEqual(http);
  });

  it("splits a bearer token out of the headers and writes it back", () => {
    const form = serverConfigToForm("github", {
      url: "https://api.example.invalid/mcp",
      headers: { authorization: "Bearer abc", "X-A": "1" },
    });
    expect(form.authMode).toBe("bearer");
    expect(form.bearerToken).toBe("abc");
    expect(form.headers.map((row) => row.key)).toEqual(["X-A"]);

    expect(
      serverFormToConfig({ ...form, bearerToken: "${NEW_TOKEN}" }).headers,
    ).toEqual({ "X-A": "1", Authorization: "Bearer ${NEW_TOKEN}" });
    expect(serverFormToConfig({ ...form, authMode: "oauth" }).headers).toEqual({
      "X-A": "1",
    });
  });

  it("keeps command and URL separate when switching transport", () => {
    const form = serverConfigToForm("s", {
      command: "node",
      args: ["server.js"],
      cwd: "/srv",
    });
    const remote = serverFormToConfig({
      ...form,
      transport: "http",
      url: "https://mcp.example.invalid/mcp",
    });
    expect(remote).toEqual({ url: "https://mcp.example.invalid/mcp" });

    const local = serverFormToConfig({
      ...serverConfigToForm("s", remote),
      transport: "stdio",
      command: "node",
    });
    expect(local).toEqual({ command: "node" });
  });

  it("splits and joins arguments with quotes", () => {
    expect(splitArgs(`-y "a b" 'c d' e "g\\"h"`)).toEqual([
      "-y",
      "a b",
      "c d",
      "e",
      'g"h',
    ]);
    const args = ["-y", "with space", 'quote"d', ""];
    expect(splitArgs(joinArgs(args))).toEqual(args);
  });

  it("reports the first problem with a form", () => {
    const form = serverConfigToForm("ok", { command: "npx" });
    expect(validateServerForm(form, [])).toBeNull();
    expect(validateServerForm({ ...form, name: " " }, [])).toBe("nameRequired");
    expect(validateServerForm({ ...form, name: "my server" }, [])).toBe(
      "nameInvalid",
    );
    expect(validateServerForm(form, ["ok"])).toBe("nameTaken");
    expect(validateServerForm({ ...form, command: "" }, [])).toBe(
      "commandRequired",
    );
    expect(
      validateServerForm(
        {
          ...form,
          transport: "http",
          url: "https://mcp.example.invalid/mcp",
          oauthCallbackPort: "70000",
        },
        [],
      ),
    ).toBe("callbackPortInvalid");
    expect(
      validateServerForm({ ...form, transport: "http", url: "npx" }, []),
    ).toBe("urlInvalid");
  });

  it("leaves agent assignments out of form saves so the daemon keeps the current ones", () => {
    const form = serverConfigToForm("fs", {
      command: "npx",
      cocurdex: { agents: ["codex"] },
    });
    expect(serverFormToConfig(form)).toEqual({ command: "npx" });
  });
});
