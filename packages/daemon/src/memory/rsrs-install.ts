import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, realpath, rename, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { RSRS_CLI_RELEASE_BASE_URL, type RsrsCliAsset } from "@cocurdex/shared";
import { downloadVerified } from "../verified-download";

// The machine's own rsrs home (~/.rsrs), which the installed app shares with
// every other rsrs client, or a private one for development and test profiles.
export type RsrsHome =
  | { kind: "global"; dataDir: string }
  | {
      kind: "isolated";
      dataDir: string;
      rpcPort: number;
      modelDir: string | null;
    };

// rsrs reads its data directory from RSRS_DATA_DIR and the port of its CLI
// host from RSRS_RPC_PORT (default 15169). A private home needs both, or its
// CLI talks to the host of another installation (respire-cli
// crates/commands/src/net_rpc.rs). RSRS_M3_DIR points it at a model it does
// not own (respire-cli crates/core-sdk/src/business.rs).
export function rsrsHomeEnv(home: RsrsHome): Record<string, string> {
  if (home.kind === "global") return {};
  return {
    RSRS_DATA_DIR: home.dataDir,
    RSRS_RPC_PORT: String(home.rpcPort),
    ...(home.modelDir ? { RSRS_M3_DIR: home.modelDir } : {}),
  };
}

export function globalRsrsDataDir(homeDir: string) {
  return path.join(homeDir, ".rsrs");
}

function samePath(left: string, right: string, os: string) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return os === "win32" || os === "darwin"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}

// Only the installed app's own profile uses the shared home; a development
// build, a scenario or a test runs under another user data path and keeps
// its memory to itself.
export function usesGlobalRsrsHome(input: {
  userDataPath: string;
  defaultUserDataPath: string;
  os: string;
}) {
  return samePath(input.userDataPath, input.defaultUserDataPath, input.os);
}

async function isFile(file: string) {
  return stat(file).then(
    (info) => info.isFile(),
    () => false,
  );
}

// The files rsrs itself requires before it loads BGE-M3
// (respire-cli crates/core-sdk/src/business.rs `model_files_present`).
export async function readyRsrsModelDir(dataDir: string) {
  const dir = path.join(dataDir, "models", "bge-m3");
  const present = await Promise.all([
    isFile(path.join(dir, "tokenizer.json")),
    isFile(path.join(dir, "onnx", "model_quantized.onnx")),
  ]);
  return present.every(Boolean) ? dir : null;
}

// A home that holds no rsrs state yet, which Cocurdex may set up itself.
export async function isFreshRsrsHome(dataDir: string) {
  const evidence = await Promise.all(
    ["session.json", "rsrs.db", "client.json", "runtime.json"].map((name) =>
      stat(path.join(dataDir, name)).then(
        () => true,
        () => false,
      ),
    ),
  );
  return !evidence.some(Boolean);
}

export function managedRsrsPath(dataDir: string, os: string) {
  return path.join(dataDir, "bin", os === "win32" ? "rsrs.exe" : "rsrs");
}

// rsrs refuses data paths that pass through a link ("offline keygen path is a
// link"), and macOS temp and home paths can (/var -> /private/var).
export async function prepareRsrsDataDir(dataDir: string) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  return realpath(dataDir);
}

export function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() =>
        port ? resolve(port) : reject(new Error("No free loopback port")),
      );
    });
  });
}

async function fileSha256(file: string) {
  const hash = createHash("sha256");
  try {
    for await (const chunk of createReadStream(file)) hash.update(chunk);
  } catch {
    return null;
  }
  return hash.digest("hex");
}

export interface ManagedRsrsCliInput {
  dataDir: string;
  os: string;
  asset: RsrsCliAsset;
  baseUrl?: string;
  beforeReplace?: () => Promise<void>;
}

// rsrs runs its runtime host from `<data dir>/bin/rsrs` and refuses to start
// when those bytes differ from the CLI that asks, so the managed CLI lives
// there and is the only one Cocurdex runs.
export async function installManagedRsrsCli(input: ManagedRsrsCliInput) {
  const { asset } = input;
  const target = managedRsrsPath(input.dataDir, input.os);
  const current = await fileSha256(target);
  if (current === asset.sha256) return { command: target, replaced: false };
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const staging = `${target}.${randomUUID()}.partial`;
  try {
    await downloadVerified(
      `${input.baseUrl ?? RSRS_CLI_RELEASE_BASE_URL}/${asset.file}`,
      staging,
      { sha256: asset.sha256, size: asset.size },
    );
    if (input.os !== "win32") await chmod(staging, 0o755);
    if (current !== null) await input.beforeReplace?.();
    await rename(staging, target);
  } finally {
    await rm(staging, { force: true });
  }
  return { command: target, replaced: current !== null };
}
