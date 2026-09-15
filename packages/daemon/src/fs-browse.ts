import { readdir, realpath, stat } from "node:fs/promises";
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
  const entries = (
    await Promise.all(
      dirents.map(async (dirent) => {
        // Dirent.isDirectory() is false for symlinks; resolve them so
        // symlinked project directories remain browsable. Broken or
        // inaccessible links are skipped without failing the listing.
        const isDirectory = dirent.isSymbolicLink()
          ? await stat(path.join(resolved, dirent.name))
              .then((stats) => stats.isDirectory())
              .catch(() => false)
          : dirent.isDirectory();
        if (!isDirectory) return null;
        return {
          hidden: dirent.name.startsWith("."),
          name: dirent.name,
          path: path.join(resolved, dirent.name),
        };
      }),
    )
  )
    .filter((entry) => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const parent = path.dirname(resolved);
  return {
    entries,
    parent: parent === resolved ? null : parent,
    path: resolved,
  };
}
