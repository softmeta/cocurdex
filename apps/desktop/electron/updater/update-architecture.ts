export function assertUpdateArchitecture(
  info: { files: ReadonlyArray<{ url: string }> },
  host: { platform: string; arch: string; translated: boolean },
): void {
  if (host.platform !== "darwin") {
    return;
  }
  let arch = "x64";
  if (host.arch === "arm64" || host.translated) {
    arch = "arm64";
  }
  const expected = `Cocurdex-mac-${arch}.zip`;
  const hasNativeZip = info.files.some((file) => {
    const url = new URL(file.url, "https://updates.cocurdex.com/");
    return url.pathname.split("/").at(-1) === expected;
  });
  if (!hasNativeZip) {
    throw new Error(
      `Update blocked: the release is missing ${expected}. Please download the correct Mac installer from the release page.`,
    );
  }
}
