import {
  buildMcpServerConfig,
  MCP_ADD_OPTIONS,
  parseMcpArgs,
  redactMcpServer,
} from "@cocurdex/cli/internal/mcp-args";
import { describe, expect, it } from "vitest";

function build(args: string[]) {
  return buildMcpServerConfig(parseMcpArgs(args, MCP_ADD_OPTIONS));
}

describe("cocurdex mcp add arguments", () => {
  it("passes everything after -- to the server command", () => {
    expect(
      build([
        "fs",
        "--env",
        "ROOT=/srv",
        "--env",
        "MODE=a=b",
        "--",
        "npx",
        "-y",
        "server-fs",
        "--verbose",
      ]),
    ).toEqual({
      name: "fs",
      config: {
        command: "npx",
        args: ["-y", "server-fs", "--verbose"],
        env: { ROOT: "/srv", MODE: "a=b" },
      },
    });
  });

  it("builds remote servers with headers and a bearer token reference", () => {
    expect(
      build([
        "github",
        "--url",
        "https://api.example.invalid/mcp",
        "--header",
        "X-Team=core",
        "--bearer-token-env-var",
        "GITHUB_TOKEN",
        "--disabled",
      ]),
    ).toEqual({
      name: "github",
      config: {
        url: "https://api.example.invalid/mcp",
        headers: {
          "X-Team": "core",
          Authorization: "Bearer ${GITHUB_TOKEN}",
        },
        enabled: false,
      },
    });
  });

  it("rejects options that do not fit the transport", () => {
    expect(() =>
      build(["x", "--url", "https://example.invalid", "--env", "A=1"]),
    ).toThrow("--env only applies to local command servers");
    expect(() => build(["x", "--header", "A=1", "--", "npx"])).toThrow(
      "--header only applies to remote servers",
    );
    expect(() => build(["x"])).toThrow("Usage");
    expect(() => build(["x", "--env", "NOVALUE", "--", "npx"])).toThrow(
      "KEY=VALUE",
    );
    expect(() => parseMcpArgs(["--nope"], MCP_ADD_OPTIONS)).toThrow(
      "Unknown option --nope",
    );
  });
});

describe("cocurdex mcp add --agent", () => {
  it("records the agents that receive the server", () => {
    expect(
      build(["fs", "--agent", "codex", "--agent", "acp:gemini", "--", "npx"])
        .config,
    ).toEqual({
      command: "npx",
      cocurdex: { agents: ["codex", "acp:gemini"] },
    });
  });

  it("leaves the default agents alone without --agent and rejects unknown ids", () => {
    expect(build(["fs", "--", "npx"]).config).toEqual({ command: "npx" });
    expect(() => build(["fs", "--agent", "gpt", "--", "npx"])).toThrow(
      'Unknown agent "gpt"',
    );
  });
});

describe("redactMcpServer", () => {
  it("hides literal secrets but keeps environment references", () => {
    expect(
      redactMcpServer({
        url: "https://example.invalid/mcp",
        headers: {
          Authorization: "Bearer sk-live",
          "X-Ref": "Bearer ${TOKEN}",
          "X-Cmd": "!pass show mcp",
        },
        oauth: { clientId: "cocurdex", clientSecret: "shh" },
      }),
    ).toEqual({
      url: "https://example.invalid/mcp",
      headers: {
        Authorization: "<redacted>",
        "X-Ref": "Bearer ${TOKEN}",
        "X-Cmd": "!pass show mcp",
      },
      oauth: { clientId: "cocurdex", clientSecret: "<redacted>" },
    });
  });
});
