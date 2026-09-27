import { atom } from "jotai";
import { desktopApi } from "@/lib";

interface HostDirectoryPickRequest {
  resolve(path: string | null): void;
}

export const hostDirectoryPickRequestAtom =
  atom<HostDirectoryPickRequest | null>(null);

// Picks a directory on the daemon host. Hosts with a native directory dialog
// keep using it; other clients browse through the daemon `fs.listDirectories`
// RPC via the mounted HostDirectoryPickerHost.
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
