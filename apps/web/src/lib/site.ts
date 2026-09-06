/** Public marketing/docs site constants (SSG). */
export const site = {
  name: "Cocurdex",
  url: "https://cocurdex.com",
  description:
    "Multi-agent development workspace for professional developers. Chat, terminal, editor, and browser preview in one desktop shell.",
  locale: "en",
} as const;

export const nav = [
  { href: "/docs/", label: "Docs" },
  { href: "/download/", label: "Download" },
] as const;

const githubLatestDownload = (fileName: string) =>
  `https://github.com/softmeta/cocurdex/releases/latest/download/${fileName}`;

export const desktopDownloads = [
  {
    id: "mac-arm64",
    href: githubLatestDownload("Cocurdex-mac-arm64.dmg"),
    label: "macOS Apple silicon",
    note: "Signed and notarized DMG.",
  },
  {
    id: "mac-x64",
    href: githubLatestDownload("Cocurdex-mac-x64.dmg"),
    label: "macOS Intel",
    note: "Signed and notarized DMG.",
  },
  {
    id: "win-x64",
    href: githubLatestDownload("Cocurdex-win-x64.exe"),
    label: "Windows x64",
    note: "Unsigned NSIS installer. SmartScreen may warn.",
  },
  {
    id: "linux-x64",
    href: githubLatestDownload("Cocurdex-linux-x64.AppImage"),
    label: "Linux x64",
    note: "AppImage. Mark it executable, then run it.",
  },
] as const;

export const githubLatestReleaseUrl =
  "https://github.com/softmeta/cocurdex/releases/latest";
