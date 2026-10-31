import path from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { parseHostPairingLink } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { startAndroidTarget } from "./lib/android";
import { buildAndroidApp } from "./lib/android-build";
import { runCommand } from "./lib/command";
import { startPairingDaemon } from "./lib/daemon";
import { startIosTarget } from "./lib/ios";
import { buildIosApp } from "./lib/ios-build";

const mobileDir = path.resolve(import.meta.dirname, "../../apps/mobile");
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    platform: { type: "string", default: "ios" },
    avd: { type: "string" },
    build: { type: "boolean", default: false },
    dev: { type: "boolean", default: false },
    stream: { type: "boolean", default: false },
    "stream-scroll": { type: "boolean", default: false },
  },
});
const platform = values.platform === "android" ? "android" : "ios";

function pairingDeepLink(pairingLink: string) {
  const parsed = parseHostPairingLink(pairingLink);
  if (!parsed) throw new Error(`Unexpected pairing link: ${pairingLink}`);
  const query = new URLSearchParams({
    host: parsed.baseUrl,
    code: parsed.code,
    hk: parsed.hostKey,
  });
  return `cocurdex://pair?${query}`;
}

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
    if (values.stream) {
      await daemon.createReplyingSession(
        "Streaming display check",
        "Stream starts immediately.\n\n中文内容与 emoji 👩🏽‍💻 保持完整。\n\n- First item\n- Second item\n\n```ts\nconst total = 42;\n```\n\nStream complete.",
      );
    }
    if (values["stream-scroll"]) {
      const reply = Array.from(
        { length: 40 },
        (_, index) =>
          `### Section ${index + 1}\n\nStable reading position. New content grows below the viewport without moving the reader. Jumping to the bottom is always a manual action.\n`,
      ).join("\n");
      await daemon.createReplyingSession("Top and follow check", reply);
    }
    const target =
      platform === "ios"
        ? await startIosTarget(mobileDir, { install: !values.dev })
        : await startAndroidTarget(mobileDir, values.avd, {
            visible: true,
            install: !values.dev,
          });
    try {
      if (platform === "ios") {
        await runCommand("open", ["-b", "com.apple.dt.Devices"]);
      }
      const printPairingLink = async () => {
        const pairingLink = await daemon.createPairingLink();
        process.stdout.write(
          `${JSON.stringify({
            platform,
            deviceId: target.deviceId,
            pairingLink,
            deepLink: pairingDeepLink(pairingLink),
          })}\n`,
        );
      };
      if (!values.dev) await target.launchApp();
      await printPairingLink();
      const input = createInterface({ input: process.stdin });
      input.on("line", () => void printPairingLink());
      await untilInterrupted();
      input.close();
    } finally {
      await target.stop();
    }
  } finally {
    await daemon.dispose();
    tempDirs.cleanup();
  }
}

await main();
