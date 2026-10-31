import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

const tempDirs = createTempDirs();
const fixtureServer = createRequire(import.meta.url).resolve(
  "@cocurdex/test-harness/fixtures/mcp-stdio-server.mjs",
);

describe("cocurdex mcp CLI", () => {
  let daemon: DaemonProcess;
  let cli: (args: string[], input?: string) => ReturnType<typeof runCli>;

  beforeAll(async () => {
    daemon = await spawnDaemon();
    cli = (args, input) =>
      runCli(args, { userDataPath: daemon.userDataPath, input });
  });

  afterAll(async () => {
    await daemon.dispose();
    await tempDirs.cleanup();
  });

  it("adds a server, checks it through Pi, and toggles it", async () => {
    const added = await cli([
      "mcp",
      "add",
      "fixture",
      "--",
      process.execPath,
      fixtureServer,
    ]);
    expect(added.stderr).toBe("");
    expect(added.code).toBe(0);

    const listed = await cli(["mcp", "list", "--json"]);
    expect(listed.code).toBe(0);
    expect(JSON.parse(listed.stdout)).toMatchObject({
      errors: [],
      servers: [
        {
          name: "fixture",
          state: "connected",
          tools: [{ name: "echo", description: "Echo the input back" }],
        },
      ],
    });

    expect((await cli(["mcp", "disable", "fixture"])).code).toBe(0);
    const disabled = await cli(["mcp", "test", "fixture", "--json"]);
    expect(JSON.parse(disabled.stdout).servers[0].state).toBe("disabled");
    expect((await cli(["mcp", "enable", "fixture"])).code).toBe(0);
  });

  it("fails list for a broken server and rejects configs Pi rejects", async () => {
    const broken = await cli([
      "mcp",
      "add",
      "broken",
      "--",
      process.execPath,
      "-e",
      "process.exit(3)",
    ]);
    expect(broken.code).toBe(0);
    const tested = await cli(["mcp", "test", "broken"]);
    expect(tested.code).toBe(1);
    expect(tested.stdout).toContain("broken: failed");

    const invalid = await cli([
      "mcp",
      "add",
      "bad",
      "--url",
      "ftp://example.invalid/mcp",
    ]);
    expect(invalid.code).toBe(1);
    expect(invalid.stderr).toContain("url must be an http or https URL");

    expect((await cli(["mcp", "remove", "broken"])).code).toBe(0);
  });

  it("imports servers from JSON and redacts secrets in show", async () => {
    const dir = await tempDirs.create("cocurdex-mcp-import-");
    const file = path.join(dir, "servers.json");
    await writeFile(
      file,
      JSON.stringify({
        mcpServers: {
          fixture: { command: "replaced" },
          remote: {
            url: "https://mcp.example.invalid/mcp",
            headers: { Authorization: "Bearer sk-secret" },
          },
        },
      }),
    );

    const imported = await cli(["mcp", "import", file]);
    expect(imported.code).toBe(0);
    expect(imported.stdout).toContain("skipped fixture: already exists");
    expect(imported.stdout).toContain("Imported remote");

    const shown = await cli(["mcp", "show", "remote"]);
    expect(JSON.parse(shown.stdout)).toEqual({
      url: "https://mcp.example.invalid/mcp",
      headers: { Authorization: "<redacted>" },
    });

    const fromStdin = await cli(
      ["mcp", "import", "-"],
      '"piped": { "command": "piped-server" }',
    );
    expect(fromStdin.stdout).toContain("Imported piped");
    const all = await cli(["mcp", "show"]);
    expect(
      Object.keys(
        JSON.parse(all.stdout.split("\n").slice(1).join("\n")).mcpServers,
      ),
    ).toEqual(["fixture", "remote", "piped"]);
  });

  it("assigns a server to agents and explains what cannot be injected", async () => {
    expect((await cli(["mcp", "agents", "fixture"])).stdout).toContain(
      'MCP server "fixture" agents: pi',
    );

    const assigned = await cli([
      "mcp",
      "agents",
      "fixture",
      "pi",
      "codex",
      "opencode",
      "--json",
    ]);
    expect(assigned.code).toBe(0);
    expect(JSON.parse(assigned.stdout)).toEqual({
      name: "fixture",
      agents: ["pi", "codex", "opencode"],
      unsupported: null,
    });
    const shown = JSON.parse((await cli(["mcp", "show", "fixture"])).stdout);
    expect(shown.cocurdex).toEqual({ agents: ["pi", "codex", "opencode"] });

    expect((await cli(["mcp", "agents", "fixture", "--none"])).code).toBe(0);
    const listed = await cli(["mcp", "list", "--json"]);
    expect(
      JSON.parse(listed.stdout).servers.find(
        (server: { name: string }) => server.name === "fixture",
      ).agents,
    ).toEqual([]);

    const unknown = await cli(["mcp", "agents", "fixture", "gpt"]);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('Unknown agent "gpt"');
  });
});
