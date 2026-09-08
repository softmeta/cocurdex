import { createNativePackageExcludes } from "./packaging-native-filters.mjs";

const ARCH_NAMES = ["ia32", "x64", "armv7l", "arm64", "universal"];
const originalFilesByConfig = new WeakMap();

function archName(arch) {
  if (typeof arch === "string") {
    return arch;
  }
  return ARCH_NAMES[arch] ?? String(arch);
}

export default function beforePack(context) {
  const config = context.packager.config;
  if (!originalFilesByConfig.has(config)) {
    originalFilesByConfig.set(
      config,
      Array.isArray(config.files) ? [...config.files] : config.files,
    );
  }
  const originalFiles = originalFilesByConfig.get(config);
  if (!Array.isArray(originalFiles)) {
    return;
  }
  const arch = archName(context.arch);
  if (arch === "universal") {
    config.files = originalFiles;
    return;
  }
  config.files = [
    ...originalFiles,
    ...createNativePackageExcludes(context.electronPlatformName, arch),
  ];
}
