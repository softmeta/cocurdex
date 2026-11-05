import { createRequire } from "node:module";
import path from "node:path";
import beforePack from "@desktop/scripts/before-pack.mjs";

const builderRequire = createRequire(
  createRequire(import.meta.url).resolve("electron-builder"),
);
const { doMergeConfigs } = builderRequire(
  "app-builder-lib/out/util/config/config.js",
);
const { getMainFileMatchers, getNodeModuleFileMatcher } = builderRequire(
  "app-builder-lib/out/fileMatcher.js",
);

type Platform = "linux" | "mac" | "win";

interface FileMatcher {
  from: string;
  isEmpty: () => boolean;
  containsOnlyIgnore: () => boolean;
  prependPattern: (pattern: string) => void;
  createFilter: () => (
    file: string,
    stat: { isDirectory: () => boolean },
  ) => boolean;
}

const ELECTRON_PLATFORMS = { linux: "linux", mac: "darwin", win: "win32" };
const X64 = 1;
const fileStat = { isDirectory: () => false };

export function packagedAppFiles(build: unknown, platform: Platform) {
  const config = doMergeConfigs([build]);
  beforePack({
    packager: { config },
    arch: X64,
    electronPlatformName: ELECTRON_PLATFORMS[platform],
  });
  const appDir = path.resolve("fixture-app");
  const destination = path.join(appDir, "destination");
  const matchers: FileMatcher[] = getMainFileMatchers(
    appDir,
    destination,
    (value: string) => value,
    config[platform],
    {
      info: {
        config,
        projectDir: appDir,
        buildResourcesDir: "build-assets",
        debugLogger: { isEnabled: false },
      },
      getNodeDependencyInfo: () => null,
    },
    path.join(appDir, "release"),
    false,
  );
  for (const matcher of matchers) {
    if (matcher.isEmpty() || matcher.containsOnlyIgnore()) {
      matcher.prependPattern("**/*");
    }
  }
  const dependencyMatcher: FileMatcher = getNodeModuleFileMatcher(
    appDir,
    destination,
    (value: string) => value,
    config[platform],
    { config, debugLogger: { isEnabled: false } },
  );
  return {
    accepts: (file: string) =>
      matchers.some((matcher) => {
        const absolute = path.join(appDir, file);
        const relative = path.relative(matcher.from, absolute);
        const inside = !relative.startsWith("..") && !path.isAbsolute(relative);
        return inside && matcher.createFilter()(absolute, fileStat);
      }),
    acceptsDependency: (file: string) =>
      dependencyMatcher.createFilter()(
        path.join(appDir, "node_modules", file),
        fileStat,
      ),
  };
}
