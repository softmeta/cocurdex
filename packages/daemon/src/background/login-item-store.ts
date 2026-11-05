import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "@cocurdex/agent-core";
import type { LoginItem } from "./login-item";

const REG_TIMEOUT_MS = 10_000;

export interface LoginItemStore {
  install(item: LoginItem): Promise<void>;
  remove(item: LoginItem): Promise<void>;
  installed(item: LoginItem): Promise<boolean>;
}

async function readText(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function registryValue(key: string, name: string) {
  try {
    const { stdout } = await runCommand("reg", ["query", key, "/v", name], {
      timeoutMs: REG_TIMEOUT_MS,
    });
    return stdout;
  } catch {
    return null;
  }
}

export const systemLoginItemStore: LoginItemStore = {
  async install(item) {
    if (item.kind === "file") {
      if ((await readText(item.path)) === item.content) return;
      await mkdir(path.dirname(item.path), { recursive: true });
      await writeFile(item.path, item.content, "utf8");
      return;
    }
    await runCommand(
      "reg",
      [
        "add",
        item.key,
        "/v",
        item.name,
        "/t",
        "REG_SZ",
        "/d",
        item.value,
        "/f",
      ],
      { timeoutMs: REG_TIMEOUT_MS },
    );
  },
  async remove(item) {
    if (item.kind === "file") {
      await rm(item.path, { force: true });
      return;
    }
    if ((await registryValue(item.key, item.name)) === null) return;
    await runCommand("reg", ["delete", item.key, "/v", item.name, "/f"], {
      timeoutMs: REG_TIMEOUT_MS,
    });
  },
  async installed(item) {
    if (item.kind === "file") return (await readText(item.path)) !== null;
    return (await registryValue(item.key, item.name)) !== null;
  },
};
