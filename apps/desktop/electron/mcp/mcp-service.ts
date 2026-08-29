import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, ipcMain } from "electron";

const DEFAULT_MCP_CONFIG = '{\n  "mcpServers": {}\n}\n';

export function getMcpConfigPath(userDataPath = app.getPath("userData")) {
  return path.join(userDataPath, "pi-agent", "mcp.json");
}

export function validateMcpConfig(content: string) {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MCP configuration must be a JSON object");
  }

  const servers = (parsed as Record<string, unknown>).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error('MCP configuration must contain an "mcpServers" object');
  }

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export async function readMcpConfig(userDataPath?: string) {
  const configPath = getMcpConfigPath(userDataPath);
  try {
    return { path: configPath, content: await readFile(configPath, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path: configPath, content: DEFAULT_MCP_CONFIG };
    }
    throw error;
  }
}

export async function saveMcpConfig(content: string, userDataPath?: string) {
  const configPath = getMcpConfigPath(userDataPath);
  const formatted = validateMcpConfig(content);
  await mkdir(path.dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.tmp`;
  await writeFile(temporaryPath, formatted, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, configPath);
  return { path: configPath, content: formatted };
}

export function registerMcpHandlers() {
  ipcMain.handle("mcp:readConfig", () => readMcpConfig());
  ipcMain.handle("mcp:saveConfig", (_event, content: string) =>
    saveMcpConfig(content),
  );
}
