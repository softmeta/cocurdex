import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseDisabledFeatures } from "@cocurdex/shared/build-policy";

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
  },
});

const disabledFeatures = parseDisabledFeatures(values.disable);
const platformTargets = PLATFORM_TARGETS[process.platform];
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
run(["./scripts/build-cli.mjs"]);
run([binPath("electron-vite", "electron-vite"), "build"]);
run([
  binPath("electron-builder", "electron-builder"),
  ...platformTargets,
  `--${process.arch}`,
  "--publish",
  "never",
  "-c.mac.notarize=false",
  "-c.directories.output=release/local",
]);

const summary = disabledFeatures.length
  ? `without ${disabledFeatures.join(", ")}`
  : "with every feature";
process.stdout.write(
  `Unsigned local build ${summary}, automatic updates off: ${path.join(desktopDir, "release/local")}\n`,
);
