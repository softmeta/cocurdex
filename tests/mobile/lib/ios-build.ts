import path from "node:path";
import { runCommand } from "./command";

export async function buildIosApp(mobileDir: string) {
  await runCommand("pnpm", ["exec", "expo", "prebuild", "--platform", "ios"], {
    cwd: mobileDir,
    env: { ...process.env, CI: "1" },
    inherit: true,
  });
  await runCommand(
    "xcodebuild",
    [
      "-workspace",
      "ios/Cocurdex.xcworkspace",
      "-scheme",
      "Cocurdex",
      "-configuration",
      "Release",
      "-sdk",
      "iphonesimulator",
      "-derivedDataPath",
      "ios/build",
      "build",
    ],
    { cwd: mobileDir, inherit: true },
  );
}

export function iosAppPath(mobileDir: string) {
  return path.join(
    mobileDir,
    "ios/build/Build/Products/Release-iphonesimulator/Cocurdex.app",
  );
}
