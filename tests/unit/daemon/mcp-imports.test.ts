import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validatePiMcpServerConfig } from "@cocurdex/agent-adapters/pi-mcp";
import {
  listMcpImportFiles,
  scanMcpImports,
} from "@cocurdex/daemon/internal/mcp-imports";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value));
}

describe("scanMcpImports", () => {
  it("reads other agents' configs and compares them with Pi's", async () => {
    const home = await tempDirs.create("cocurdex-mcp-home-");
    const workspace = await tempDirs.create("cocurdex-mcp-ws-");
    await writeJson(path.join(home, ".claude.json"), {
      projects: {},
      mcpServers: {
        github: {
          type: "http",
          url: "https://api.example.invalid/mcp",
          headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
        },
        legacy: { type: "sse", url: "https://example.invalid/sse" },
      },
    });
    await writeJson(path.join(workspace, ".mcp.json"), {
      mcpServers: { postgres: { command: "npx", args: ["pg-mcp"] } },
    });
    await writeJson(path.join(home, ".cursor", "mcp.json"), {
      mcpServers: { figma: { url: "https://figma.example.invalid/mcp" } },
    });
    await writeJson(path.join(home, ".gemini", "config", "mcp_config.json"), {
      mcpServers: {
        linear: {
          serverUrl: "https://linear.example.invalid/mcp",
          disabled: true,
        },
      },
    });
    await writeFile(path.join(home, ".cursor", "broken.json"), "{");

    const candidates = await scanMcpImports({
      files: listMcpImportFiles(home, workspace),
      current: {
        postgres: { command: "npx", args: ["pg-mcp"], enabled: false },
        figma: { url: "https://other.example.invalid/mcp" },
      },
      validate: validatePiMcpServerConfig,
    });

    const byName = Object.fromEntries(
      candidates.map((candidate) => [candidate.name, candidate]),
    );
    expect(candidates.map((candidate) => candidate.source)).toEqual([
      "claude",
      "claude",
      "cursor",
      "antigravity",
      "claude-project",
    ]);
    expect(byName.github).toMatchObject({ match: "new", unsupported: null });
    expect(byName.legacy.unsupported).toContain("SSE");
    expect(byName.postgres.match).toBe("same");
    expect(byName.figma.match).toBe("different");
    expect(byName.linear).toMatchObject({
      config: { url: "https://linear.example.invalid/mcp", enabled: false },
      disabledInSource: true,
      unsupported: null,
    });
  });

  it("reads Codex TOML and OpenCode JSONC configs", async () => {
    const home = await tempDirs.create("cocurdex-mcp-home-");
    const workspace = await tempDirs.create("cocurdex-mcp-ws-");
    await mkdir(path.join(home, ".codex"), { recursive: true });
    await writeFile(
      path.join(home, ".codex", "config.toml"),
      [
        'model = "gpt-5"',
        "[mcp_servers.docs]",
        'command = "npx"',
        'args = ["-y", "docs-mcp"]',
        'env_vars = ["DOCS_TOKEN", { name = "DOCS_REGION" }]',
        "startup_timeout_sec = 30",
        "[mcp_servers.docs.env]",
        'DOCS_MODE = "fast"',
        "[mcp_servers.tracker]",
        'url = "https://tracker.example.invalid/mcp"',
        'bearer_token_env_var = "TRACKER_TOKEN"',
        'http_headers = { "X-Team" = "core" }',
        'env_http_headers = { "X-Org" = "TRACKER_ORG" }',
        "enabled = false",
      ].join("\n"),
    );
    await mkdir(path.join(workspace, ".codex"), { recursive: true });
    await writeFile(
      path.join(workspace, ".codex", "config.toml"),
      '[mcp_servers.local]\ncommand = "./bin/mcp"\ncwd = "."\n',
    );
    await mkdir(path.join(home, ".config", "opencode"), { recursive: true });
    await writeFile(
      path.join(home, ".config", "opencode", "opencode.jsonc"),
      `{
        // global servers
        "mcp": {
          "search": {
            "type": "local",
            "command": ["bunx", "search-mcp", "--key", "{env:SEARCH_KEY}"],
            "environment": { "SEARCH_MODE": "deep" },
          },
          "wiki": {
            "type": "remote",
            "url": "https://wiki.example.invalid/mcp",
            "headers": { "Authorization": "Bearer {env:WIKI_TOKEN}" },
            "enabled": false,
          },
          "servers": {
            "notes": { "type": "local", "command": ["notes-mcp"], "disabled": true },
          },
          "timeout": 5000,
        },
      }`,
    );
    await writeJson(path.join(workspace, ".opencode", "opencode.json"), {
      mcp: { board: { type: "remote", url: "https://board.example.invalid" } },
    });
    await writeFile(path.join(workspace, "opencode.json"), "{ broken");

    const candidates = await scanMcpImports({
      files: listMcpImportFiles(home, workspace),
      current: {},
      validate: validatePiMcpServerConfig,
    });
    const byName = Object.fromEntries(
      candidates.map((candidate) => [candidate.name, candidate]),
    );

    expect(candidates.map((candidate) => candidate.name)).toEqual([
      "docs",
      "tracker",
      "search",
      "wiki",
      "notes",
      "local",
      "board",
    ]);
    expect(byName.docs).toMatchObject({
      source: "codex",
      config: {
        command: "npx",
        args: ["-y", "docs-mcp"],
        env: {
          DOCS_TOKEN: "${DOCS_TOKEN}",
          DOCS_REGION: "${DOCS_REGION}",
          DOCS_MODE: "fast",
        },
      },
      disabledInSource: false,
    });
    expect(byName.docs.config).not.toHaveProperty("startup_timeout_sec");
    expect(byName.tracker).toMatchObject({
      config: {
        url: "https://tracker.example.invalid/mcp",
        headers: {
          "X-Team": "core",
          "X-Org": "${TRACKER_ORG}",
          Authorization: "Bearer ${TRACKER_TOKEN}",
        },
        enabled: false,
      },
      disabledInSource: true,
    });
    expect(byName.search).toMatchObject({
      source: "opencode",
      config: {
        command: "bunx",
        args: ["search-mcp", "--key", "${SEARCH_KEY}"],
        env: { SEARCH_MODE: "deep" },
      },
      unsupported: null,
    });
    expect(byName.wiki.config).toEqual({
      url: "https://wiki.example.invalid/mcp",
      headers: { Authorization: "Bearer ${WIKI_TOKEN}" },
      enabled: false,
    });
    expect(byName.notes.disabledInSource).toBe(true);
    expect(byName.local).toMatchObject({
      source: "codex-project",
      config: { command: "./bin/mcp", cwd: "." },
    });
    expect(byName.board.source).toBe("opencode-project");
  });

  it("follows CODEX_HOME and the OpenCode config directory overrides", () => {
    const home = path.join(path.sep, "home", "user");
    const files = listMcpImportFiles(home, null, {
      CODEX_HOME: path.join(home, "codex-home"),
      XDG_CONFIG_HOME: path.join(home, "xdg"),
    }).map((file) => file.path);
    expect(files).toContain(path.join(home, "codex-home", "config.toml"));
    expect(files).toContain(
      path.join(home, "xdg", "opencode", "opencode.json"),
    );

    const overridden = listMcpImportFiles(home, null, {
      OPENCODE_CONFIG_DIR: path.join(home, "oc"),
      XDG_CONFIG_HOME: path.join(home, "xdg"),
    }).map((file) => file.path);
    expect(overridden).toContain(path.join(home, "oc", "opencode.jsonc"));
  });

  it("skips project files when no workspace is given", () => {
    const sources = new Set(
      listMcpImportFiles("/home", null).map((file) => file.source),
    );
    expect([...sources]).toEqual([
      "claude",
      "codex",
      "cursor",
      "opencode",
      "antigravity",
    ]);
  });
});
