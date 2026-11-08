import { atom } from "jotai";
import { desktopApi } from "@/lib";

interface HostDirectoryPickRequest {
  resolve(path: string | null): void;
}

export const hostDirectoryPickRequestAtom =
  atom<HostDirectoryPickRequest | null>(null);

export const pickHostDirectoryAtom = atom(null, async (get, set) => {
  if (desktopApi.capabilities.nativeDirectoryDialog) {
    const result = await desktopApi.openWorkspace();
    return result.canceled ? null : (result.filePaths[0] ?? null);
  }
  get(hostDirectoryPickRequestAtom)?.resolve(null);
  return new Promise<string | null>((resolve) => {
    set(hostDirectoryPickRequestAtom, { resolve });
  });
});
