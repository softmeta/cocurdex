/** Public marketing/docs site constants (SSG). */
export const site = {
  name: "Cocurdex",
  url: "https://cocurdex.com",
} as const;

const githubLatestDownload = (fileName: string) =>
  `https://github.com/softmeta/cocurdex/releases/latest/download/${fileName}`;

/** Download build ids and URLs; localized labels live in i18n/marketing. */
export const desktopDownloads = [
  {
    id: "mac-arm64",
    href: githubLatestDownload("Cocurdex-mac-arm64.dmg"),
  },
  {
    id: "mac-x64",
    href: githubLatestDownload("Cocurdex-mac-x64.dmg"),
  },
  {
    id: "win-x64",
    href: githubLatestDownload("Cocurdex-win-x64.exe"),
  },
  {
    id: "linux-x64",
    href: githubLatestDownload("Cocurdex-linux-x64.AppImage"),
  },
] as const;

export type BuildId = (typeof desktopDownloads)[number]["id"];

export const githubLatestReleaseUrl =
  "https://github.com/softmeta/cocurdex/releases/latest";
