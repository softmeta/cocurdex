import path from "node:path";

export function resolveOssLicensesFilePath(options: {
  desktopRoot: string;
  isPackaged: boolean;
  resourcesPath: string;
}): string {
  if (options.isPackaged) {
    return path.join(options.resourcesPath, "oss-licenses.json");
  }
  return path.join(options.desktopRoot, "resources", "oss-licenses.json");
}

export function resolveChromiumLicensesCandidates(options: {
  execPath: string;
  resourcesPath: string;
}): string[] {
  return [
    path.join(options.resourcesPath, "LICENSES.chromium.html"),
    path.join(path.dirname(options.execPath), "LICENSES.chromium.html"),
    path.join(
      options.resourcesPath,
      "..",
      "Frameworks",
      "Electron Framework.framework",
      "Resources",
      "LICENSES.chromium.html",
    ),
    path.join(
      options.resourcesPath,
      "..",
      "Frameworks",
      "Electron Framework.framework",
      "Versions",
      "Current",
      "Resources",
      "LICENSES.chromium.html",
    ),
  ];
}
