import { createNativePackageExcludes } from "./packaging-native-filters.mjs";

const ARCH_NAMES = ["ia32", "x64", "armv7l", "arm64", "universal"];
const PLATFORM_CONFIG_KEYS = {
  darwin: "mac",
  win32: "win",
  linux: "linux",
};
const originalFilesByConfig = new WeakMap();

function archName(arch) {
  if (typeof arch === "string") {
    return arch;
  }
  return ARCH_NAMES[arch] ?? String(arch);
}

function cloneFiles(files) {
  return Array.isArray(files) ? [...files] : [];
}

export default function beforePack(context) {
  const config = context.packager.config;
  const platformKey = PLATFORM_CONFIG_KEYS[context.electronPlatformName];
  if (platformKey == null) {
    return;
  }

  let originals = originalFilesByConfig.get(config);
  if (originals == null) {
    originals = {
      files: cloneFiles(config.files),
      platformFiles: {},
    };
    originalFilesByConfig.set(config, originals);
  }
  if (!Object.hasOwn(originals.platformFiles, platformKey)) {
    originals.platformFiles[platformKey] = cloneFiles(
      config[platformKey]?.files,
    );
  }

  if (config[platformKey] == null) {
    config[platformKey] = {};
  }

  const arch = archName(context.arch);
  if (arch === "universal") {
    config[platformKey].files = originals.platformFiles[platformKey];
    return;
  }

  config[platformKey].files = [
    ...originals.files,
    ...originals.platformFiles[platformKey],
    ...createNativePackageExcludes(context.electronPlatformName, arch),
  ];
}
