import path from "node:path";
import { parseArgs } from "node:util";
import { createTempDirs } from "@cocurdex/shared/testing";
import { buildAndroidApp, startAndroidTarget } from "./lib/android";
import { runCommand } from "./lib/command";
import { startPairingDaemon } from "./lib/daemon";
import { buildIosApp, startIosTarget } from "./lib/ios";

const mobileDir = path.resolve(import.meta.dirname, "../../apps/mobile");
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    platform: { type: "string", default: "ios" },
    avd: { type: "string" },
    build: { type: "boolean", default: false },
  },
});
const platform = values.platform === "android" ? "android" : "ios";

function untilInterrupted() {
  return new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve());
    process.once("SIGTERM", () => resolve());
  });
}

async function main() {
  if (values.build) {
    await (platform === "ios"
      ? buildIosApp(mobileDir)
      : buildAndroidApp(mobileDir));
  }
  const tempDirs = createTempDirs();
  const daemon = await startPairingDaemon(platform, tempDirs);
  try {
    const target =
      platform === "ios"
        ? await startIosTarget(mobileDir)
        : await startAndroidTarget(mobileDir, values.avd, { visible: true });
    try {
      if (platform === "ios") {
        await runCommand("open", ["-b", "com.apple.dt.Devices"]);
      }
      const pairingLink = await daemon.createPairingLink();
      await target.launchApp();
      process.stdout.write(
        `${JSON.stringify({ platform, deviceId: target.deviceId, pairingLink })}\n`,
      );
      await untilInterrupted();
    } finally {
      await target.stop();
    }
  } finally {
    await daemon.dispose();
    tempDirs.cleanup();
  }
}

await main();
