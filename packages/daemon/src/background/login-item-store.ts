import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import path from "node:path";
import { runCommand } from "@cocurdex/agent-core";
import type { LoginItem } from "./login-item";

const REG_TIMEOUT_MS = 10_000;
const SYSTEMCTL_TIMEOUT_MS = 15_000;

export type BackgroundStart = "boot" | "login";

export interface LoginItemStore {
  install(item: LoginItem): Promise<void>;
  remove(item: LoginItem): Promise<void>;
  installed(item: LoginItem): Promise<boolean>;
  startsAt(item: LoginItem): Promise<BackgroundStart>;
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

async function writeIfChanged(filePath: string, content: string) {
  if ((await readText(filePath)) === content) return false;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return true;
}

function systemctl(args: string[]) {
  return runCommand("systemctl", ["--user", ...args], {
    timeoutMs: SYSTEMCTL_TIMEOUT_MS,
  });
}

async function lingerEnabled() {
  try {
    const { stdout } = await runCommand(
      "loginctl",
      ["show-user", userInfo().username, "--property=Linger", "--value"],
      { timeoutMs: SYSTEMCTL_TIMEOUT_MS },
    );
    return stdout.trim() === "yes";
  } catch {
    return false;
  }
}

async function installSystemdUnit(
  item: Extract<LoginItem, { kind: "systemd" }>,
) {
  if (await writeIfChanged(item.path, item.content)) {
    await systemctl(["daemon-reload"]);
  }
  await systemctl(["enable", item.unit]);
  if (!(await lingerEnabled())) {
    await runCommand("loginctl", ["enable-linger"], {
      timeoutMs: SYSTEMCTL_TIMEOUT_MS,
    }).catch(() => undefined);
  }
}

async function removeSystemdUnit(
  item: Extract<LoginItem, { kind: "systemd" }>,
) {
  if ((await readText(item.path)) === null) return;
  await systemctl(["disable", item.unit]).catch(() => undefined);
  await rm(item.path, { force: true });
  await systemctl(["daemon-reload"]).catch(() => undefined);
}

export const systemLoginItemStore: LoginItemStore = {
  async install(item) {
    if (item.kind === "systemd") return installSystemdUnit(item);
    if (item.kind === "file") {
      await writeIfChanged(item.path, item.content);
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
    if (item.kind === "systemd") return removeSystemdUnit(item);
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
    if (item.kind !== "registry") return (await readText(item.path)) !== null;
    return (await registryValue(item.key, item.name)) !== null;
  },
  async startsAt(item) {
    if (item.kind === "systemd" && (await lingerEnabled())) return "boot";
    return "login";
  },
};
