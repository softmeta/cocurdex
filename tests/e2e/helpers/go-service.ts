import type { ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { killProcessTree, spawnCommand } from "@cocurdex/agent-adapters";

const BUILD_TIMEOUT_MS = 180_000;
const START_TIMEOUT_MS = 15_000;

export function runProcess(command: string, args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawnCommand(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => output.push(chunk));
    const timer = setTimeout(() => {
      if (child.pid) void killProcessTree(child.pid);
    }, BUILD_TIMEOUT_MS);
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timer);
      const text = Buffer.concat(output).toString("utf8");
      if (code === 0) resolve(text);
      else reject(new Error(`${command} ${args.join(" ")} failed:\n${text}`));
    });
  });
}

export async function buildGoBinary(
  packageName: string,
  command: string,
  outDir: string,
) {
  const sourceDir = path.dirname(
    createRequire(import.meta.url).resolve(`${packageName}/package.json`),
  );
  const name = process.platform === "win32" ? `${command}.exe` : command;
  const binary = path.join(outDir, name);
  await runProcess(
    "go",
    ["build", "-o", binary, `./cmd/${command}`],
    sourceDir,
  );
  return binary;
}

export function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No free port")),
      );
    });
  });
}

export interface ServiceProcess {
  url: string;
  stop(): Promise<void>;
}

async function waitForHealth(url: string, child: ChildProcess) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${url} exited with ${child.exitCode}`);
    }
    const healthy = await fetch(`${url}/healthz`)
      .then((response) => response.ok)
      .catch(() => false);
    if (healthy) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${url} did not become healthy`);
}

export async function startService(
  binary: string,
  args: (listen: string) => string[],
  cwd: string,
  port?: number,
): Promise<ServiceProcess> {
  const listenPort = port ?? (await freePort());
  const child = spawnCommand(binary, args(`127.0.0.1:${listenPort}`), {
    cwd,
    stdio: "ignore",
  });
  const exited = new Promise<void>((resolve) => child.once("exit", resolve));
  const url = `http://127.0.0.1:${listenPort}`;
  try {
    await waitForHealth(url, child);
  } catch (error) {
    if (child.pid) await killProcessTree(child.pid);
    throw error;
  }
  return {
    url,
    stop: async () => {
      if (child.exitCode === null && child.pid) {
        await killProcessTree(child.pid);
      }
      await exited;
    },
  };
}
