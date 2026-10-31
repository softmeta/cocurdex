import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type McpImportCandidate,
  type McpImportSource,
  type McpServerConfig,
  sameMcpServerConfig,
} from "@cocurdex/shared";
import {
  type McpImportFormat,
  readImportedMcpServers,
} from "./mcp-import-formats";

interface McpImportFile {
  source: McpImportSource;
  path: string;
  format: McpImportFormat;
}

type McpImportEnv = Record<string, string | undefined>;

const OPENCODE_CONFIG_NAMES = ["opencode.json", "opencode.jsonc"];

function codexHome(homeDir: string, env: McpImportEnv) {
  return env.CODEX_HOME || path.join(homeDir, ".codex");
}

function openCodeConfigDir(homeDir: string, env: McpImportEnv) {
  if (env.OPENCODE_CONFIG_DIR) return env.OPENCODE_CONFIG_DIR;
  const configHome = env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
  return path.join(configHome, "opencode");
}

function openCodeFiles(
  source: McpImportSource,
  directory: string,
): McpImportFile[] {
  return OPENCODE_CONFIG_NAMES.map((name) => ({
    source,
    path: path.join(directory, name),
    format: "opencode-jsonc",
  }));
}

function globalImportFiles(
  homeDir: string,
  env: McpImportEnv,
): McpImportFile[] {
  return [
    {
      source: "claude",
      path: path.join(homeDir, ".claude.json"),
      format: "mcp-json",
    },
    {
      source: "codex",
      path: path.join(codexHome(homeDir, env), "config.toml"),
      format: "codex-toml",
    },
    {
      source: "cursor",
      path: path.join(homeDir, ".cursor", "mcp.json"),
      format: "mcp-json",
    },
    ...openCodeFiles("opencode", openCodeConfigDir(homeDir, env)),
    {
      source: "antigravity",
      path: path.join(homeDir, ".gemini", "config", "mcp_config.json"),
      format: "mcp-json",
    },
  ];
}

function projectImportFiles(workspaceRootPath: string): McpImportFile[] {
  return [
    {
      source: "claude-project",
      path: path.join(workspaceRootPath, ".mcp.json"),
      format: "mcp-json",
    },
    {
      source: "codex-project",
      path: path.join(workspaceRootPath, ".codex", "config.toml"),
      format: "codex-toml",
    },
    ...openCodeFiles("opencode-project", workspaceRootPath),
    ...openCodeFiles(
      "opencode-project",
      path.join(workspaceRootPath, ".opencode"),
    ),
  ];
}

export function listMcpImportFiles(
  homeDir: string,
  workspaceRootPath: string | null,
  env: McpImportEnv = {},
): McpImportFile[] {
  return [
    ...globalImportFiles(homeDir, env),
    ...(workspaceRootPath ? projectImportFiles(workspaceRootPath) : []),
  ];
}

async function readServers(file: McpImportFile) {
  let content: string;
  try {
    content = await readFile(file.path, "utf8");
  } catch {
    return [];
  }
  return readImportedMcpServers(file.format, content);
}

export async function scanMcpImports(options: {
  files: McpImportFile[];
  current: Record<string, McpServerConfig>;
  validate(name: string, config: McpServerConfig): Promise<string | null>;
}): Promise<McpImportCandidate[]> {
  const perFile = await Promise.all(
    options.files.map(async (file) => {
      const servers = await readServers(file);
      return Promise.all(
        servers.map(
          async ({
            name,
            config,
            disabledInSource,
          }): Promise<McpImportCandidate> => {
            const existing = options.current[name];
            let match: McpImportCandidate["match"] = "new";
            if (existing) {
              match = sameMcpServerConfig(existing, config)
                ? "same"
                : "different";
            }
            return {
              source: file.source,
              sourcePath: file.path,
              name,
              config,
              match,
              disabledInSource,
              unsupported: await options.validate(name, config),
            };
          },
        ),
      );
    }),
  );
  return perFile.flat();
}
