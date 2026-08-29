import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const vendorRoot = path.join(desktopRoot, "vendor", "fd");
const manifestPath = path.join(vendorRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const DOWNLOAD_TIMEOUT_MS = 30_000;

const targetAliases = new Map([
  ["darwin-universal", ["darwin-arm64", "darwin-x64"]],
]);

function getTargetFromHost() {
  const arch = process.arch === "x64" ? "x64" : process.arch;
  return `${process.platform}-${arch}`;
}

function parseTargets() {
  const targetIndex = process.argv.indexOf("--target");
  const target =
    targetIndex === -1 ? getTargetFromHost() : process.argv[targetIndex + 1];

  if (!target) {
    throw new Error("Missing value after --target.");
  }

  return targetAliases.get(target) ?? [target];
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadArchive(url, destination) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  const data = await readFile(filePath);
  hash.update(data);
  return hash.digest("hex");
}

async function prepareTarget(target) {
  const entry = manifest.targets[target];
  if (!entry) {
    throw new Error(`Unsupported fd target: ${target}`);
  }

  const targetDir = path.join(vendorRoot, target);
  const binaryPath = path.join(targetDir, "fd");
  const versionPath = path.join(targetDir, ".version");

  if ((await exists(binaryPath)) && (await exists(versionPath))) {
    const installedVersion = (await readFile(versionPath, "utf8")).trim();
    if (installedVersion === manifest.version) {
      console.log(`fd ${manifest.version} already prepared for ${target}`);
      return;
    }
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "cocurdex-fd-"));
  const archivePath = path.join(tempDir, "fd.tar.gz");

  try {
    await downloadArchive(entry.url, archivePath);
    const actualSha = await sha256(archivePath);
    if (actualSha !== entry.sha256) {
      throw new Error(
        `SHA256 mismatch for ${target}: expected ${entry.sha256}, got ${actualSha}`,
      );
    }

    execFileSync("tar", ["-xzf", archivePath, "-C", tempDir], {
      stdio: "ignore",
    });

    await mkdir(targetDir, { recursive: true });
    await copyFile(path.join(tempDir, entry.archivePath), binaryPath);
    await chmod(binaryPath, 0o755);
    await writeFile(versionPath, `${manifest.version}\n`, "utf8");
    console.log(`prepared fd ${manifest.version} for ${target}`);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

for (const target of parseTargets()) {
  await prepareTarget(target);
}
