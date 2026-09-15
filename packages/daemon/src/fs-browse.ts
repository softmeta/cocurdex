import { readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { HostDirectoryListing } from "@cocurdex/shared";

// Directory browsing on the daemon host so remote-style clients can pick a
// workspace root without a native file dialog. Entries are directories only.
export async function listHostDirectories(
  directoryPath?: string,
): Promise<HostDirectoryListing> {
  const requested = directoryPath?.trim() ? directoryPath : homedir();
  const resolved = await realpath(requested).catch(() =>
    path.resolve(requested),
  );
  const dirents = await readdir(resolved, { withFileTypes: true });
  const entries = dirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => ({
      hidden: dirent.name.startsWith("."),
      name: dirent.name,
      path: path.join(resolved, dirent.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const parent = path.dirname(resolved);
  return {
    entries,
    parent: parent === resolved ? null : parent,
    path: resolved,
  };
}
