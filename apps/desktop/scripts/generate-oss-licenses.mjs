import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  collectUniqueTexts,
  FD_MIT_LICENSE,
  flattenPnpmLicenses,
  isExcludedPackage,
  makePackageId,
  OSS_LICENSES_FILE_VERSION,
  parsePnpmLicensesJson,
  readLicenseText,
  uniqueId,
} from "./oss-licenses-generate-lib.mjs";

function desktopRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function runPnpmLicenses(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["licenses", "list", "--json"], {
      cwd,
      env: process.env,
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `pnpm licenses list exited ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function isExecutedDirectly() {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

export async function generateOssLicensesFile(options) {
  const desktopRoot = options.desktopRoot;
  const repoRoot = options.repoRoot;
  const outputPath = options.outputPath;
  const desktopPackage = JSON.parse(
    await readFile(path.join(desktopRoot, "package.json"), "utf8"),
  );
  const appVersion =
    typeof desktopPackage.version === "string" ? desktopPackage.version : null;
  const appText = (
    await readFile(path.join(repoRoot, "LICENSE.md"), "utf8")
  ).trim();
  if (!appText) {
    throw new Error("LICENSE.md is empty");
  }

  const stdout = await runPnpmLicenses(desktopRoot);
  const flattened = flattenPnpmLicenses(parsePnpmLicensesJson(stdout)).filter(
    (item) => !isExcludedPackage(item.name),
  );

  const fdManifest = JSON.parse(
    await readFile(path.join(desktopRoot, "vendor/fd/manifest.json"), "utf8"),
  );
  const fdVersion =
    typeof fdManifest.version === "string" ? fdManifest.version : null;

  const seen = new Set();
  const items = [
    {
      homepage: "https://cocurdex.com",
      id: uniqueId("app:cocurdex", seen),
      kind: "app",
      license: "FSL-1.1-ALv2",
      name: "Cocurdex",
      text: appText,
      version: appVersion,
    },
    {
      homepage: "https://github.com/sharkdp/fd",
      id: uniqueId("native:fd", seen),
      kind: "native",
      license: "MIT",
      name: "fd",
      text: FD_MIT_LICENSE,
      version: fdVersion,
    },
  ];

  for (const item of flattened) {
    const text = await readLicenseText(item.packagePath);
    items.push({
      homepage: item.homepage,
      id: uniqueId(makePackageId(item.name, item.version), seen),
      kind: "package",
      license: item.license,
      name: item.name,
      text,
      version: item.version,
    });
  }

  const { entries, texts } = collectUniqueTexts(items);
  if (entries.length === 0) {
    throw new Error("OSS license catalog is empty");
  }

  const file = {
    entries,
    generatedAt: new Date().toISOString(),
    texts,
    version: OSS_LICENSES_FILE_VERSION,
  };
  await writeFile(outputPath, `${JSON.stringify(file)}\n`);
  return file;
}

async function main() {
  const desktopRoot = desktopRootFromScript();
  const outputPath = path.join(desktopRoot, "resources", "oss-licenses.json");
  const file = await generateOssLicensesFile({
    desktopRoot,
    outputPath,
    repoRoot: path.resolve(desktopRoot, "../.."),
  });
  console.log(`Wrote ${file.entries.length} license entries to ${outputPath}`);
}

if (isExecutedDirectly()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
