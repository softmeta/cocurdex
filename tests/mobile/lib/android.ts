import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { killProcessTree, spawnCommand } from "@cocurdex/agent-adapters";
import { androidApkPath, androidSdk } from "./android-build";
import { FatalWaitError, runCommand, waitUntil } from "./command";
import type { MobileTarget } from "./target";

export const EMULATOR_HOST_ALIAS = "10.0.2.2";
const APP_ID = "dev.cocurdex.mobile";
const BOOT_TIMEOUT_MS = 240_000;
const FIRST_CONSOLE_PORT = 5554;
const LAST_CONSOLE_PORT = 5682;
const EMULATOR_OUTPUT_LIMIT = 16_384;
const IME_DISABLE_TIMEOUT_MS = 15_000;
const PAIRING_QR_FIXTURE = createRequire(import.meta.url).resolve(
  "../fixtures/pairing-qr.png",
);

function adb(sdk: string) {
  return path.join(sdk, "platform-tools", "adb");
}

async function firstAvd(sdk: string) {
  const output = await runCommand(path.join(sdk, "emulator", "emulator"), [
    "-list-avds",
  ]);
  const avd = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("INFO"));
  if (!avd) throw new Error("No Android virtual device; create one first");
  return avd;
}

async function freeConsolePort(sdk: string) {
  const devices = await runCommand(adb(sdk), ["devices"]);
  for (let port = FIRST_CONSOLE_PORT; port <= LAST_CONSOLE_PORT; port += 2) {
    if (!devices.includes(`emulator-${port}`)) return port;
  }
  throw new Error("No free emulator console port");
}

export async function startAndroidTarget(
  mobileDir: string,
  avdName: string | undefined,
  options: { visible?: boolean; install?: boolean; appPath?: string } = {},
): Promise<MobileTarget> {
  const apkPath = options.appPath ?? androidApkPath(mobileDir);
  const install = options.install ?? true;
  if (install && !existsSync(apkPath)) {
    throw new Error(`Missing ${apkPath}; run with --build first`);
  }
  const sdk = androidSdk();
  const avd = avdName ?? (await firstAvd(sdk));
  const port = await freeConsolePort(sdk);
  const serial = `emulator-${port}`;
  const emulator = spawnCommand(
    path.join(sdk, "emulator", "emulator"),
    [
      "-avd",
      avd,
      "-port",
      String(port),
      "-read-only",
      ...(options.visible ? [] : ["-no-window"]),
      "-no-audio",
      "-no-boot-anim",
      "-no-snapshot",
      "-camera-back",
      `imagefile:${PAIRING_QR_FIXTURE}`,
      "-gpu",
      emulatorGpuMode(process.platform),
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let emulatorOutput = "";
  const keepOutput = (chunk: Buffer) => {
    emulatorOutput = (emulatorOutput + chunk.toString("utf8")).slice(
      -EMULATOR_OUTPUT_LIMIT,
    );
  };
  emulator.stdout?.on("data", keepOutput);
  emulator.stderr?.on("data", keepOutput);
  const shell = (...args: string[]) =>
    runCommand(adb(sdk), ["-s", serial, "shell", ...args]);
  const stop = async () => {
    await runCommand(adb(sdk), ["-s", serial, "emu", "kill"]).catch(() => "");
    if (emulator.exitCode === null && emulator.pid) {
      await killProcessTree(emulator.pid);
    }
  };
  try {
    await waitUntil(
      async () => {
        if (emulator.exitCode !== null) {
          throw new EmulatorExitedError(emulator.exitCode);
        }
        return (await shell("getprop", "sys.boot_completed")).trim() === "1";
      },
      BOOT_TIMEOUT_MS,
      `${serial} to boot`,
    ).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`${reason}\nEmulator output:\n${emulatorOutput}`);
    });
    if (install) {
      await runCommand(adb(sdk), ["-s", serial, "install", "-r", apkPath]);
    }
    await disableInputMethods(shell);
    return {
      deviceId: serial,
      setAppearance: async (appearance) => {
        await shell(
          "cmd",
          "uimode",
          "night",
          appearance === "dark" ? "yes" : "no",
        );
      },
      setLocale: async (locale) => {
        await shell(
          "cmd",
          "locale",
          "set-app-locales",
          APP_ID,
          "--locales",
          locale,
        );
      },
      resetState: async () => {
        await shell("pm", "clear", APP_ID);
        await shell("pm", "grant", APP_ID, "android.permission.CAMERA");
      },
      launchApp: async () => {
        const resolved = await shell(
          "cmd",
          "package",
          "resolve-activity",
          "--brief",
          "-c",
          "android.intent.category.LAUNCHER",
          APP_ID,
        );
        const component = parseLines(resolved).at(-1);
        if (!component?.includes("/")) {
          throw new Error(`${APP_ID} has no launcher activity:\n${resolved}`);
        }
        await shell("am", "start", "-W", "-n", component);
      },
      diagnostics: async () => {
        const devices = await runCommand(adb(sdk), ["devices", "-l"]).catch(
          (error: unknown) => String(error),
        );
        const appLog = await runCommand(adb(sdk), [
          "-s",
          serial,
          "logcat",
          "-d",
          "-b",
          "crash,main",
          "-s",
          "AndroidRuntime:E",
          "ReactNativeJS:*",
          "libc:F",
          "DEBUG:F",
        ]).catch((error: unknown) => String(error));
        return [
          `Emulator ${serial} exit code: ${emulator.exitCode ?? "running"}`,
          `adb devices:\n${devices.trim()}`,
          `App log:\n${appLog.trim()}`,
          `Emulator output:\n${emulatorOutput}`,
        ].join("\n");
      },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

class EmulatorExitedError extends FatalWaitError {
  constructor(code: number) {
    super(`Emulator exited with ${code} before booting`);
  }
}

async function disableInputMethods(
  shell: (...args: string[]) => Promise<string>,
) {
  const listImes = async () => parseLines(await shell("ime", "list", "-s"));
  for (const ime of await listImes()) {
    await shell("pm", "disable-user", "--user", "0", imePackage(ime));
  }
  await waitUntil(
    async () => (await listImes()).length === 0,
    IME_DISABLE_TIMEOUT_MS,
    "input methods to be disabled",
  );
}

function emulatorGpuMode(platform: NodeJS.Platform) {
  return platform === "linux" ? "swiftshader_indirect" : "auto";
}

function imePackage(ime: string) {
  return ime.split("/")[0] ?? ime;
}

function parseLines(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
