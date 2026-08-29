import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const desktopRoot = resolve(__dirname, "../../..");
const repoRoot = resolve(desktopRoot, "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("production logging", () => {
  it("keeps desktop success-path diagnostics behind logging helpers", () => {
    const sourcePaths = [
      "apps/desktop/src/lib/performance.ts",
      "apps/desktop/src/app/layout/sidebar/conversation-sidebar-item.tsx",
      "apps/desktop/src/app/layout/sidebar/session-sidebar-item.tsx",
      "apps/desktop/src/features/sessions/new-session-card/use-new-session-card.ts",
      "apps/desktop/electron/chat/app-state.ts",
      "packages/daemon/src/state.ts",
    ];

    for (const sourcePath of sourcePaths) {
      const source = readProjectFile(sourcePath);

      expect(source).not.toContain("console.info(");
      expect(source).not.toContain("console.debug(");
    }
  });
});
