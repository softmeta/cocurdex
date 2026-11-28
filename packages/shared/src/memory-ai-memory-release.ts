import type { MemoryPlatform } from "./memory-rsrs-release";

export const AI_MEMORY_VERSION = "3.6.4";
export const AI_MEMORY_RELEASE_BASE_URL = `https://github.com/akitaonrails/ai-memory/releases/download/v${AI_MEMORY_VERSION}`;

export interface AiMemoryAsset {
  file: string;
  executable: string;
  sha256: string;
  size: number;
}

// Digests come from the release's `<asset>.sha256` files. The release ships no
// Windows arm64 or musl build; the Linux binaries link glibc.
const AI_MEMORY_ASSETS: Readonly<Record<string, AiMemoryAsset>> = {
  "darwin-arm64": {
    file: "ai-memory-macos-aarch64.tar.gz",
    executable: "ai-memory",
    sha256: "cedcce93ecf4bfc15e33b8250ac28c99d4412afd62af65f509e9a7805828c130",
    size: 22_997_071,
  },
  "darwin-x64": {
    file: "ai-memory-macos-x86_64.tar.gz",
    executable: "ai-memory",
    sha256: "897f05a13766037fd71c39354a644b8cc0655b6b3f71c26e96fc1c7ce13be771",
    size: 24_761_311,
  },
  "linux-arm64": {
    file: "ai-memory-linux-aarch64.tar.gz",
    executable: "ai-memory",
    sha256: "d711e4e405f22b95d86892be391f2da54c03e631b6abac2ba4001f4437c0688b",
    size: 23_785_815,
  },
  "linux-x64": {
    file: "ai-memory-linux-x86_64.tar.gz",
    executable: "ai-memory",
    sha256: "73bf08b9f8c51b40e36bf5f53a595e404b2e55fc93daa58d9c1ea63de9ab6128",
    size: 25_377_321,
  },
  "win32-x64": {
    file: "ai-memory-windows-x86_64.zip",
    executable: "ai-memory.exe",
    sha256: "d2020399fe4f3cabab494dadb72d287c815c62c018daa5cd3a20424d57e48517",
    size: 28_322_949,
  },
};

export function aiMemoryAsset(platform: MemoryPlatform): AiMemoryAsset | null {
  if (platform.os === "linux" && platform.libc === "musl") return null;
  return AI_MEMORY_ASSETS[`${platform.os}-${platform.arch}`] ?? null;
}
