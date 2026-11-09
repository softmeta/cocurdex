import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseDisabledFeatures } from "@cocurdex/shared/build-policy";
import { stagedLocalBuilderConfig } from "./local-builder-config.mjs";

const desktopDir = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(desktopDir, "package.json"));

const PLATFORM_TARGETS = {
  darwin: ["--mac", "dmg"],
  win32: ["--win", "nsis"],
  linux: ["--linux", "AppImage", "deb"],
};

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    disable: { type: "string", default: "" },
    zip: { type: "boolean", default: false },
  },
});

const disabledFeatures = parseDisabledFeatures(values.disable);
if (values.zip && process.platform !== "darwin") {
  throw new Error("--zip is only supported on macOS");
}
const platformTargets = values.zip
  ? ["--mac", "zip"]
  : PLATFORM_TARGETS[process.platform];
if (!platformTargets) {
  throw new Error(`Local builds are not supported on ${process.platform}`);
}

const env = {
  ...process.env,
  COCURDEX_BUILD_POLICY: JSON.stringify({ disabledFeatures, updates: false }),
  CSC_IDENTITY_AUTO_DISCOVERY: "false",
};

function binPath(packageName, binName) {
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const { bin } = require(manifestPath);
  const relative = typeof bin === "string" ? bin : bin[binName];
  return path.join(path.dirname(manifestPath), relative);
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: desktopDir,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${args.join(" ")} exited with ${result.status}`);
  }
}

run(["./scripts/generate-oss-licenses.mjs"]);
run(["./scripts/ensure-fd.mjs"]);
run(["./scripts/prepare-electron.mjs", "--cache-for-packaging", process.arch]);
const stageDir = "release/.local-stage";
const stagedOutDir = `${stageDir}/out`;
const stagedCliDir = `${stageDir}/cli`;
const builderConfigPath = path.join(
  desktopDir,
  stageDir,
  "electron-builder.json",
);
rmSync(path.join(desktopDir, stageDir), { force: true, recursive: true });
mkdirSync(path.join(desktopDir, stageDir), { recursive: true });

run(["./scripts/build-cli.mjs", "--out-dir", stagedCliDir]);
run([
  binPath("electron-vite", "electron-vite"),
  "build",
  "--outDir",
  stagedOutDir,
]);

const { build } = JSON.parse(
  readFileSync(path.join(desktopDir, "package.json"), "utf8"),
);
writeFileSync(
  builderConfigPath,
  JSON.stringify(
    stagedLocalBuilderConfig(build, {
      stagedOutDir,
      stagedCliDir,
      outputDir: "release/local",
    }),
    null,
    2,
  ),
  "utf8",
);
run([
  binPath("electron-builder", "electron-builder"),
  ...platformTargets,
  `--${process.arch}`,
  "--publish",
  "never",
  "--config",
  builderConfigPath,
]);

const summary = disabledFeatures.length
  ? `without ${disabledFeatures.join(", ")}`
  : "with every feature";
process.stdout.write(
  `Unsigned local build ${summary}, automatic updates off: ${path.join(desktopDir, "release/local")}\n`,
);
