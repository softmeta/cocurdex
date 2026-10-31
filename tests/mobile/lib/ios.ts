import { existsSync } from "node:fs";
import type { SupportedLocale } from "@cocurdex/shared";
import { runCommand } from "./command";
import { iosAppPath } from "./ios-build";
import type { MobileTarget } from "./target";

const PREFERRED_DEVICE_TYPE = "iPhone 16 Pro";
const IOS_APP_ID = "dev.cocurdex.mobile";

const IOS_LANGUAGES: Record<
  SupportedLocale,
  { language: string; locale: string }
> = {
  "en-US": { language: "en-US", locale: "en_US" },
  "zh-CN": { language: "zh-Hans-CN", locale: "zh_CN" },
};

interface SimctlRuntime {
  identifier: string;
  platform: string;
  isAvailable: boolean;
  version: string;
  supportedDeviceTypes: { identifier: string; name: string }[];
}

function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

async function latestIosRuntime() {
  const output = await runCommand("xcrun", [
    "simctl",
    "list",
    "--json",
    "runtimes",
  ]);
  const { runtimes } = JSON.parse(output) as { runtimes: SimctlRuntime[] };
  const runtime = runtimes
    .filter(
      (candidate) => candidate.platform === "iOS" && candidate.isAvailable,
    )
    .sort((left, right) => compareVersions(right.version, left.version))[0];
  if (!runtime) throw new Error("No available iOS simulator runtime");
  const deviceType =
    runtime.supportedDeviceTypes.find(
      (type) => type.name === PREFERRED_DEVICE_TYPE,
    ) ??
    runtime.supportedDeviceTypes.find((type) => type.name.startsWith("iPhone"));
  if (!deviceType) throw new Error(`No iPhone type for ${runtime.identifier}`);
  return { runtime: runtime.identifier, deviceType: deviceType.identifier };
}

const SIMULATOR_PREFIX = "cocurdex-e2e-";

function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function deleteOrphanedSimulators() {
  const output = await runCommand("xcrun", [
    "simctl",
    "list",
    "--json",
    "devices",
  ]);
  const { devices } = JSON.parse(output) as {
    devices: Record<string, { udid: string; name: string }[]>;
  };
  const orphans = Object.values(devices)
    .flat()
    .filter(({ name }) => {
      if (!name.startsWith(SIMULATOR_PREFIX)) return false;
      const pid = Number(name.slice(SIMULATOR_PREFIX.length));
      return Number.isInteger(pid) && !processAlive(pid);
    });
  for (const { udid } of orphans) {
    await runCommand("xcrun", ["simctl", "shutdown", udid]).catch(() => "");
    await runCommand("xcrun", ["simctl", "delete", udid]).catch(() => "");
  }
}

async function createSimulator() {
  await deleteOrphanedSimulators();
  const { runtime, deviceType } = await latestIosRuntime();
  const output = await runCommand("xcrun", [
    "simctl",
    "create",
    `${SIMULATOR_PREFIX}${process.pid}`,
    deviceType,
    runtime,
  ]);
  return output.trim();
}

export async function startIosTarget(
  mobileDir: string,
  options: { install?: boolean; appPath?: string; deviceId?: string } = {},
): Promise<MobileTarget> {
  const install = options.install ?? true;
  const appPath = options.appPath ?? iosAppPath(mobileDir);
  if (install && !existsSync(appPath)) {
    throw new Error(`Missing ${appPath}; run with --build first`);
  }
  const owned = options.deviceId === undefined;
  const udid = options.deviceId ?? (await createSimulator());
  const stop = async () => {
    if (!owned) return;
    await runCommand("xcrun", ["simctl", "shutdown", udid]).catch(() => "");
    await runCommand("xcrun", ["simctl", "delete", udid]);
  };
  try {
    if (owned) await runCommand("xcrun", ["simctl", "boot", udid]);
    await runCommand("xcrun", ["simctl", "bootstatus", udid, "-b"]);
    if (install) {
      await runCommand("xcrun", ["simctl", "install", udid, appPath]);
    }
    return {
      deviceId: udid,
      setAppearance: async (appearance) => {
        await runCommand("xcrun", [
          "simctl",
          "ui",
          udid,
          "appearance",
          appearance,
        ]);
      },
      setLocale: async (locale) => {
        const { language, locale: region } = IOS_LANGUAGES[locale];
        const defaults = [
          "simctl",
          "spawn",
          udid,
          "defaults",
          "write",
          "Apple Global Domain",
        ];
        await runCommand("xcrun", [
          ...defaults,
          "AppleLanguages",
          "-array",
          language,
        ]);
        await runCommand("xcrun", [
          ...defaults,
          "AppleLocale",
          "-string",
          region,
        ]);
      },
      resetState: async () => {
        await runCommand("xcrun", ["simctl", "keychain", udid, "reset"]);
        await runCommand("xcrun", [
          "simctl",
          "privacy",
          udid,
          "grant",
          "camera",
          IOS_APP_ID,
        ]);
      },
      launchApp: async () => {
        await runCommand("xcrun", ["simctl", "launch", udid, IOS_APP_ID]);
      },
      diagnostics: async () => {
        const devices = await runCommand("xcrun", [
          "simctl",
          "list",
          "devices",
          udid,
        ]).catch((error: unknown) => String(error));
        const appLog = await runCommand("xcrun", [
          "simctl",
          "spawn",
          udid,
          "log",
          "show",
          "--last",
          "5m",
          "--style",
          "compact",
          "--predicate",
          'process == "Cocurdex"',
        ]).catch((error: unknown) => String(error));
        return `Simulator ${udid}:\n${devices.trim()}\nApp log:\n${appLog.trim()}`;
      },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
