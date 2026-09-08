export const PACKAGED_NATIVE_PACKAGE_IDS = [
  "darwin-arm64",
  "darwin-universal",
  "darwin-x64",
  "freebsd-x64",
  "linux-arm",
  "linux-arm-gnueabihf",
  "linux-arm64",
  "linux-arm64-gnu",
  "linux-arm64-musl",
  "linux-ia32",
  "linux-ppc64",
  "linux-riscv64",
  "linux-riscv64-gnu",
  "linux-s390x",
  "linux-x64",
  "linux-x64-gnu",
  "linux-x64-musl",
  "win32-arm64",
  "win32-arm64-msvc",
  "win32-ia32",
  "win32-ia32-msvc",
  "win32-x64",
  "win32-x64-msvc",
];

export const PACKAGED_NATIVE_PACKAGE_SCOPES = [
  "@mariozechner/clipboard",
  "@napi-rs/keyring",
  "@vscode/ripgrep",
];

export const NODE_PTY_PREBUILD_IDS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
];

export function nativeIdMatchesTarget(id, platform, arch) {
  const targetArch = arch === "armv7l" ? "arm" : arch;
  if (id === "universal") {
    return false;
  }
  if (!id.startsWith(`${platform}-`)) {
    return false;
  }
  const rest = id.slice(platform.length + 1);
  if (targetArch === "arm64") {
    return rest === "arm64" || rest.startsWith("arm64-");
  }
  if (targetArch === "arm") {
    return (
      rest === "arm" || rest.startsWith("arm-") || rest.startsWith("armv7")
    );
  }
  return rest === targetArch || rest.startsWith(`${targetArch}-`);
}

export function createNativePackageExcludes(platform, arch) {
  const excludes = [];
  for (const pkg of PACKAGED_NATIVE_PACKAGE_SCOPES) {
    for (const id of PACKAGED_NATIVE_PACKAGE_IDS) {
      if (nativeIdMatchesTarget(id, platform, arch)) {
        continue;
      }
      excludes.push(`!**/node_modules/${pkg}-${id}/**/*`);
    }
  }
  for (const id of NODE_PTY_PREBUILD_IDS) {
    if (nativeIdMatchesTarget(id, platform, arch)) {
      continue;
    }
    excludes.push(`!**/node_modules/node-pty/prebuilds/${id}/**/*`);
  }
  return excludes;
}
