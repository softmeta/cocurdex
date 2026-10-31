import { desktopApi } from "@/lib";

export function canPickLocalFiles() {
  return desktopApi.capabilities.localFilePaths;
}

export function pickLocalFilePath(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        resolve(file ? desktopApi.getPathForFile(file) : null);
      },
      { once: true },
    );
    input.click();
  });
}
