import { createNativePackageExcludes } from "./packaging-native-filters.mjs";

const ARCH_NAMES = ["ia32", "x64", "armv7l", "arm64", "universal"];
const PLATFORM_CONFIG_KEYS = {
  darwin: "mac",
  win32: "win",
  linux: "linux",
};
const originalPlatformFilesByConfig = new WeakMap();

function archName(arch) {
  if (typeof arch === "string") {
    return arch;
  }
  return ARCH_NAMES[arch] ?? String(arch);
}

export default function beforePack(context) {
  const config = context.packager.config;
  const platformKey = PLATFORM_CONFIG_KEYS[context.electronPlatformName];
  if (platformKey == null) {
    return;
  }

  let originals = originalPlatformFilesByConfig.get(config);
  if (originals == null) {
    originals = {};
    originalPlatformFilesByConfig.set(config, originals);
  }
  if (!Object.hasOwn(originals, platformKey)) {
    const existing = config[platformKey]?.files;
    originals[platformKey] = Array.isArray(existing) ? [...existing] : [];
  }

  if (config[platformKey] == null) {
    config[platformKey] = {};
  }

  const arch = archName(context.arch);
  if (arch === "universal") {
    config[platformKey].files = originals[platformKey];
    return;
  }

  config[platformKey].files = [
    ...originals[platformKey],
    ...createNativePackageExcludes(context.electronPlatformName, arch),
  ];
}
