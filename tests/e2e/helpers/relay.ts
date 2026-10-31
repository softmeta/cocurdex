import type { ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { killProcessTree, spawnCommand } from "@cocurdex/agent-adapters";

const relayDir = path.dirname(
  createRequire(import.meta.url).resolve("@cocurdex/relay/package.json"),
);

const BUILD_TIMEOUT_MS = 180_000;
const START_TIMEOUT_MS = 15_000;

function run(command: string, args: string[], cwd: string) {
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

export async function buildRelay(outDir: string) {
  const name =
    process.platform === "win32" ? "cocurdex-relay.exe" : "cocurdex-relay";
  const binary = path.join(outDir, name);
  await run("go", ["build", "-o", binary, "./cmd/cocurdex-relay"], relayDir);
  return binary;
}

export function runRelayCommand(binary: string, args: string[]) {
  return run(binary, args, path.dirname(binary));
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

export interface RelayProcess {
  url: string;
  stop(): Promise<void>;
}

async function waitForHealth(url: string, child: ChildProcess) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The relay exited with ${child.exitCode}`);
    }
    const healthy = await fetch(`${url}/healthz`)
      .then((response) => response.ok)
      .catch(() => false);
    if (healthy) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("The relay did not become healthy");
}

export async function startRelay(
  binary: string,
  dataDir: string,
  extraArgs: string[] = [],
  port?: number,
): Promise<RelayProcess> {
  const listenPort = port ?? (await freePort());
  const child = spawnCommand(
    binary,
    [
      "serve",
      "--listen",
      `127.0.0.1:${listenPort}`,
      "--data-dir",
      dataDir,
      ...extraArgs,
    ],
    { cwd: dataDir, stdio: "ignore" },
  );
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
