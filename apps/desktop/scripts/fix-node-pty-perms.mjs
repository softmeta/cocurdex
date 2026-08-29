// pnpm's content-addressed store + link strategy can strip the +x bit from
// node-pty's `spawn-helper` prebuild on macOS/Linux, leaving the binary
// readable but not executable. Without it, `posix_spawnp` fails with EACCES at
// runtime and the renderer surfaces "Error: posix_spawnp failed.".
//
// Run this as a postinstall step to make sure all platform prebuilds are
// marked executable. Safe to run repeatedly; missing files are skipped.

import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function nodePtyRoot() {
  try {
    return path.dirname(require.resolve("node-pty/package.json"));
  } catch {
    return null;
  }
}

const root = nodePtyRoot();
if (!root) {
  // node-pty might not be installed (e.g. someone is running scripts on
  // packages/* before linking). Bail silently — pnpm will install it on
  // the next pass.
  process.exit(0);
}

const targets = [
  "prebuilds/darwin-arm64/spawn-helper",
  "prebuilds/darwin-x64/spawn-helper",
  "prebuilds/linux-x64/spawn-helper",
  "prebuilds/linux-arm64/spawn-helper",
];

let fixed = 0;
for (const rel of targets) {
  const full = path.join(root, rel);
  if (!existsSync(full)) {
    continue;
  }
  try {
    chmodSync(full, 0o755);
    fixed += 1;
  } catch (error) {
    console.warn(
      `[fix-node-pty-perms] could not chmod ${full}:`,
      error?.message ?? error,
    );
  }
}

if (fixed > 0) {
  console.log(
    `[fix-node-pty-perms] ensured +x on ${fixed} spawn-helper binarie(s)`,
  );
}
