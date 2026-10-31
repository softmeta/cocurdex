import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { createFingerprintAsync } from "@expo/fingerprint";
import {
  androidApkPath,
  androidSdk,
  buildAndroidApp,
} from "./lib/android-build";
import { runCommand } from "./lib/command";
import { buildIosApp, iosAppPath } from "./lib/ios-build";
import type { MobilePlatform } from "./lib/target";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const mobileDir = path.join(repoRoot, "apps/mobile");
const patchesDir = path.join(repoRoot, "patches");
const BUILD_SCRIPTS = [
  "app.ts",
  "lib/android-build.ts",
  "lib/command.ts",
  "lib/ios-build.ts",
].map((file) => path.join(import.meta.dirname, file));
const APP_FILE: Record<MobilePlatform, string> = {
  ios: "Cocurdex.app",
  android: "Cocurdex.apk",
};

const { values, positionals } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  allowPositionals: true,
  options: {
    platform: { type: "string" },
    out: { type: "string" },
    source: { type: "string" },
  },
});

function parsePlatform(value: string | undefined): MobilePlatform {
  if (value !== "ios" && value !== "android") {
    throw new Error(`--platform must be ios or android, not ${value}`);
  }
  return value;
}

function requiredPath(value: string | undefined, flag: string) {
  if (!value) throw new Error(`${flag} is required`);
  return path.resolve(value);
}

function buildInputs() {
  const patches = readdirSync(patchesDir)
    .sort()
    .map((name) => `${name}\n${readFileSync(path.join(patchesDir, name))}`);
  const scripts = BUILD_SCRIPTS.map(
    (file) => `${path.basename(file)}\n${readFileSync(file)}`,
  );
  return [...patches, ...scripts].join("\n");
}

async function nativeFingerprint(platform: MobilePlatform) {
  const { hash } = await createFingerprintAsync(mobileDir, {
    platforms: [platform],
    ignorePaths: ["android/**", "ios/**"],
    extraSources: [
      {
        type: "contents",
        id: "cocurdexNativeBuildInputs",
        contents: buildInputs(),
        reasons: ["pnpmPatches", "e2eBuildScripts"],
      },
    ],
    silent: true,
  });
  return hash;
}

async function buildApp(platform: MobilePlatform, outDir: string) {
  await (platform === "ios"
    ? buildIosApp(mobileDir)
    : buildAndroidApp(mobileDir));
  const product =
    platform === "ios" ? iosAppPath(mobileDir) : androidApkPath(mobileDir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(product, path.join(outDir, APP_FILE[platform]), {
    recursive: true,
    verbatimSymlinks: true,
  });
}

function latestBuildTools(sdk: string) {
  const buildTools = path.join(sdk, "build-tools");
  const latest = readdirSync(buildTools)
    .sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    )
    .at(-1);
  if (!latest) throw new Error(`No Android build tools in ${buildTools}`);
  return path.join(buildTools, latest);
}

async function androidSigningArgs(workDir: string) {
  const keystore = path.join(workDir, "repack.keystore");
  await runCommand("keytool", [
    "-genkeypair",
    "-keystore",
    keystore,
    "-storepass",
    "android",
    "-keypass",
    "android",
    "-alias",
    "repack",
    "-keyalg",
    "RSA",
    "-keysize",
    "2048",
    "-validity",
    "365",
    "-dname",
    "CN=Cocurdex e2e",
  ]);
  return [
    "--ks",
    keystore,
    "--ks-key-alias",
    "repack",
    "--android-build-tools-dir",
    latestBuildTools(androidSdk()),
  ];
}

async function repackApp(
  platform: MobilePlatform,
  source: string,
  outDir: string,
) {
  const tempDirs = createTempDirs();
  try {
    const workDir = tempDirs.createSync("cocu-repack-");
    const signing =
      platform === "android" ? await androidSigningArgs(workDir) : [];
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    await runCommand(
      "pnpm",
      [
        "exec",
        "repack-app",
        "--platform",
        platform,
        "--source-app",
        source,
        "--output",
        path.join(outDir, APP_FILE[platform]),
        "--working-directory",
        path.join(workDir, "work"),
        ...signing,
        mobileDir,
      ],
      { cwd: import.meta.dirname, inherit: true },
    );
  } finally {
    await tempDirs.cleanup();
  }
}

async function main() {
  const [command] = positionals;
  const platform = parsePlatform(values.platform);
  if (command === "fingerprint") {
    process.stdout.write(`${await nativeFingerprint(platform)}\n`);
    return;
  }
  if (command === "build") {
    await buildApp(platform, requiredPath(values.out, "--out"));
    return;
  }
  if (command === "repack") {
    await repackApp(
      platform,
      requiredPath(values.source, "--source"),
      requiredPath(values.out, "--out"),
    );
    return;
  }
  throw new Error(
    `Unknown command ${command}; use fingerprint, build, or repack`,
  );
}

await main();
