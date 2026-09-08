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
  if (files == null) {
    return [];
  }
  const entries = Array.isArray(files) ? files : [files];
  return entries.flatMap((entry) => {
    if (typeof entry === "string" || entry.from != null || entry.to != null) {
      return [entry];
    }
    if (entry.filter == null) {
      return ["**/*"];
    }
    return Array.isArray(entry.filter) ? [...entry.filter] : [entry.filter];
  });
}

function toFileSets(entries) {
  const fileSets = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      fileSets.push(entry);
      continue;
    }
    const previous = fileSets.at(-1);
    if (previous != null && previous.from == null && previous.to == null) {
      previous.filter.push(entry);
    } else {
      fileSets.push({ filter: [entry] });
    }
  }
  return fileSets;
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
    config[platformKey].files = toFileSets(
      originals.platformFiles[platformKey],
    );
    return;
  }

  config[platformKey].files = toFileSets([
    ...originals.files,
    ...originals.platformFiles[platformKey],
    ...createNativePackageExcludes(context.electronPlatformName, arch),
  ]);
}
