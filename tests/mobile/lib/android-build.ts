import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./command";

export function emulatorAbi(arch: NodeJS.Architecture) {
  return arch === "arm64" ? "arm64-v8a" : "x86_64";
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
  const architectures = `-PreactNativeArchitectures=${emulatorAbi(process.arch)}`;
  await runCommand(
    gradlew,
    ["assembleRelease", architectures, "--console=plain"],
    {
      cwd: path.join(mobileDir, "android"),
      env,
      inherit: true,
    },
  );
}

export function androidApkPath(mobileDir: string) {
  return path.join(
    mobileDir,
    "android/app/build/outputs/apk/release/app-release.apk",
  );
}
