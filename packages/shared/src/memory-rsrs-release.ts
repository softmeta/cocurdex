export interface MemoryPlatform {
  os: string;
  arch: string;
  libc?: "glibc" | "musl";
}

export const RSRS_CLI_VERSION = "2.0.0-dev.3";
export const RSRS_MIN_CLI_VERSION = "2.0.0-dev.3";
export const RSRS_CLI_RELEASE_BASE_URL = `https://github.com/risense-ai/respire-cli/releases/download/v${RSRS_CLI_VERSION}`;

export interface RsrsCliAsset {
  target: string;
  file: string;
  sha256: string;
  size: number;
}

// Digests come from the release's `cli-build-<target>.json` files.
const RSRS_CLI_ASSETS: readonly RsrsCliAsset[] = [
  {
    target: "aarch64-apple-darwin",
    file: "rsrs-aarch64-apple-darwin",
    sha256: "e893ed0df7dc9a18d690c81af2537df85a907c7c033b61c060b7b1ae1a0ef1c1",
    size: 11_726_656,
  },
  {
    target: "aarch64-pc-windows-msvc",
    file: "rsrs-aarch64-pc-windows-msvc.exe",
    sha256: "7e1af4f989850656b699a67546ecd9cd07a39c9cbf343b9c52d500610294f2e1",
    size: 11_646_976,
  },
  {
    target: "x86_64-pc-windows-msvc",
    file: "rsrs-x86_64-pc-windows-msvc.exe",
    sha256: "c484f2259f29db7eb4499656d8750ea18ca230ade33f7cbc5a9b812cf09b740d",
    size: 14_087_680,
  },
  {
    target: "aarch64-unknown-linux-gnu",
    file: "rsrs-aarch64-unknown-linux-gnu",
    sha256: "5cd906b94597d273463477b1fc0c09579309e3bb98771f5203ef29881d291d68",
    size: 13_814_400,
  },
  {
    target: "x86_64-unknown-linux-gnu",
    file: "rsrs-x86_64-unknown-linux-gnu",
    sha256: "903e0595a76d930e82287d27b6c370bebcbbb9d3a4da2905c9fab1244f6c0261",
    size: 14_927_720,
  },
  {
    target: "x86_64-unknown-linux-musl",
    file: "rsrs-x86_64-unknown-linux-musl",
    sha256: "f506f17fc621edd30fff6bc9be91c9089a9e6f63cfb5fb4d7e23b249226e4625",
    size: 15_068_264,
  },
];

// The gnu builds link against GLIBC_2.39 symbols (COC-138); an older glibc
// runs the statically linked musl build instead.
const RSRS_GNU_MIN_GLIBC = "2.39";

export function rsrsLibcFor(
  glibcVersion: string | undefined,
): MemoryPlatform["libc"] {
  if (!glibcVersion) return "musl";
  const order = compareRsrsVersions(
    `${glibcVersion}.0`,
    `${RSRS_GNU_MIN_GLIBC}.0`,
  );
  return order !== null && order < 0 ? "musl" : "glibc";
}

const ARCH_TRIPLE: Record<string, string> = {
  arm64: "aarch64",
  x64: "x86_64",
};

function targetTriple(platform: MemoryPlatform) {
  const arch = ARCH_TRIPLE[platform.arch];
  if (!arch) return null;
  if (platform.os === "darwin") return `${arch}-apple-darwin`;
  if (platform.os === "win32") return `${arch}-pc-windows-msvc`;
  if (platform.os === "linux") {
    const libc = platform.libc === "musl" ? "musl" : "gnu";
    return `${arch}-unknown-linux-${libc}`;
  }
  return null;
}

export function rsrsCliAsset(platform: MemoryPlatform): RsrsCliAsset | null {
  const target = targetTriple(platform);
  return RSRS_CLI_ASSETS.find((asset) => asset.target === target) ?? null;
}

const VERSION_PATTERN = /(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

function comparePrerelease(
  left: string | undefined,
  right: string | undefined,
) {
  if (left === right) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  const a = left.split(".");
  const b = right.split(".");
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index];
    const y = b[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) {
      const difference = Number(x) - Number(y);
      if (difference !== 0) return Math.sign(difference);
    } else if (xNumeric !== yNumeric) {
      return xNumeric ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

// Semantic version order (semver.org section 11). Returns null when either
// side has no version in it, such as an unrecognized `rsrs --version` line.
export function compareRsrsVersions(left: string, right: string) {
  const a = VERSION_PATTERN.exec(left);
  const b = VERSION_PATTERN.exec(right);
  if (!a || !b) return null;
  for (const index of [1, 2, 3]) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference !== 0) return Math.sign(difference);
  }
  return comparePrerelease(a[4], b[4]);
}

export function rsrsVersionMeetsMinimum(version: string) {
  const order = compareRsrsVersions(version, RSRS_MIN_CLI_VERSION);
  return order === null || order >= 0;
}
