import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { downloadGitHubReleaseAsset } from "./github-release-asset.mjs";

const require = createRequire(import.meta.url);

let installScript;
try {
  installScript = require.resolve("electron/install.js");
} catch {
  throw new Error(
    "electron is not installed. Run pnpm install from the repo root.",
  );
}

function install() {
  const result = spawnSync(process.execPath, [installScript], {
    stdio: "inherit",
  });
  return result.status ?? 1;
}

const electronRequire = createRequire(installScript);
const { version } = electronRequire("./package.json");
const { downloadArtifact } = electronRequire("@electron/get");
const checksums = electronRequire("./checksums.json");
const platform =
  process.env.ELECTRON_INSTALL_PLATFORM ??
  process.env.npm_config_platform ??
  process.platform;
const hostArch =
  process.env.ELECTRON_INSTALL_ARCH ??
  process.env.npm_config_arch ??
  process.arch;

function downloadOptions(arch) {
  return {
    version,
    artifactName: "electron",
    platform,
    arch,
    cacheRoot: process.env.electron_config_cache,
    checksums,
  };
}

function downloadFromGitHubApi(arch) {
  const filename = `electron-v${version}-${platform}-${arch}.zip`;

  return downloadArtifact({
    ...downloadOptions(arch),
    downloader: {
      download(_url, destination) {
        return downloadGitHubReleaseAsset(
          "electron/electron",
          `v${version}`,
          filename,
          destination,
        );
      },
    },
  });
}

if (process.argv[2] === "--cache-for-packaging") {
  const arches = process.argv.slice(3);
  for (const arch of arches.length > 0 ? arches : [hostArch]) {
    const archive = await downloadArtifact(downloadOptions(arch)).catch(() =>
      downloadFromGitHubApi(arch),
    );
    const cacheRoot = path.dirname(path.dirname(archive));
    const checksumFile = Object.entries(checksums)
      .map(([filename, checksum]) => `${checksum} *${filename}\n`)
      .join("");
    await writeFile(
      path.join(cacheRoot, `SHASUMS256.txt-${version}`),
      checksumFile,
    );
  }
  process.exit(0);
}

const status = install();
if (status === 0) process.exit(0);

console.log("Retrying Electron through the GitHub release asset API.");
await downloadFromGitHubApi(hostArch);
process.exit(install());
