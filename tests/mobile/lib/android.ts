import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { killProcessTree, spawnCommand } from "@cocurdex/agent-adapters";
import { FatalWaitError, runCommand, waitUntil } from "./command";
import type { MobileTarget } from "./target";

export const EMULATOR_HOST_ALIAS = "10.0.2.2";
const APP_ID = "dev.cocurdex.mobile";
const BOOT_TIMEOUT_MS = 240_000;
const FIRST_CONSOLE_PORT = 5554;
const LAST_CONSOLE_PORT = 5682;
const EMULATOR_OUTPUT_LIMIT = 16_384;
const IME_DISABLE_TIMEOUT_MS = 15_000;

function emulatorGpuMode(platform: NodeJS.Platform) {
  return platform === "linux" ? "swiftshader_indirect" : "auto";
}

export function defaultAndroidSdk(platform: NodeJS.Platform, home: string) {
  if (platform === "darwin") return path.join(home, "Library/Android/sdk");
  if (platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(home, "AppData/Local");
    return path.join(localAppData, "Android/Sdk");
  }
  return path.join(home, "Android/Sdk");
}

function androidStudioJdkCandidates(platform: NodeJS.Platform, home: string) {
  if (platform === "darwin") {
    const bundle = "Android Studio.app/Contents/jbr/Contents/Home";
    return [
      path.join("/Applications", bundle),
      path.join(home, "Applications", bundle),
    ];
  }
  if (platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    return [path.join(programFiles, "Android", "Android Studio", "jbr")];
  }
  return ["/opt/android-studio/jbr", path.join(home, "android-studio", "jbr")];
}

function androidJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;
  return androidStudioJdkCandidates(process.platform, os.homedir()).find(
    (candidate) => existsSync(candidate),
  );
}

export function androidSdk() {
  return (
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    defaultAndroidSdk(process.platform, os.homedir())
  );
}

function adb(sdk: string) {
  return path.join(sdk, "platform-tools", "adb");
}

export async function buildAndroidApp(mobileDir: string) {
  const javaHome = androidJavaHome();
  const env = {
    ...process.env,
    ANDROID_HOME: androidSdk(),
    CI: "1",
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  };
  await runCommand(
    "pnpm",
    ["exec", "expo", "prebuild", "--platform", "android"],
    { cwd: mobileDir, env, inherit: true },
  );
  const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  await runCommand(gradlew, ["assembleRelease", "--console=plain"], {
    cwd: path.join(mobileDir, "android"),
    env,
    inherit: true,
  });
}

export function androidApkPath(mobileDir: string) {
  return path.join(
    mobileDir,
    "android/app/build/outputs/apk/release/app-release.apk",
  );
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
  options: { visible?: boolean } = {},
): Promise<MobileTarget> {
  const apkPath = androidApkPath(mobileDir);
  if (!existsSync(apkPath)) {
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
      "-no-snapshot-save",
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
    await runCommand(adb(sdk), ["-s", serial, "install", "-r", apkPath]);
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
        return [
          `Emulator ${serial} exit code: ${emulator.exitCode ?? "running"}`,
          `adb devices:\n${devices.trim()}`,
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

function imePackage(ime: string) {
  return ime.split("/")[0] ?? ime;
}

function parseLines(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
