import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { selectLintInput } from "../../../scripts/lint-i18n-selection.mjs";

const repoRoot = join(tmpdir(), "cocurdex-i18n-selection-repo");
let tempDirs: string[] = [];

async function createDesktopRoot() {
  const tempDir = await mkdtemp(repoRoot);
  tempDirs = [...tempDirs, tempDir];
  return join(tempDir, "apps/desktop");
}

async function writeDesktopFile(
  desktopRoot: string,
  filePath: string,
  contents: string,
) {
  const absolutePath = join(desktopRoot, filePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf-8");
  return absolutePath;
}

describe("selectLintInput", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.map((tempDir) => rm(tempDir, { force: true, recursive: true })),
    );
    tempDirs = [];
  });

  it("skips staged source files that cannot contain i18n issues", async () => {
    const desktopRoot = await createDesktopRoot();
    const sourceFile = await writeDesktopFile(
      desktopRoot,
      "src/lib/math.ts",
      "export const add = (left: number, right: number) => left + right;\n",
    );

    const selected = await selectLintInput({
      desktopRoot,
      files: [sourceFile],
      forceFull: false,
    });

    expect(selected).toEqual({
      input: [],
      reason: "no i18n-sensitive source files",
    });
  });

  it("checks staged source files that use translations", async () => {
    const desktopRoot = await createDesktopRoot();
    const sourceFile = await writeDesktopFile(
      desktopRoot,
      "src/features/settings/settings-title.tsx",
      'export function SettingsTitle() { return <h1>{t("settings.title")}</h1>; }\n',
    );

    const selected = await selectLintInput({
      desktopRoot,
      files: [sourceFile],
      forceFull: false,
    });

    expect(selected).toEqual({
      input: ["src/features/settings/settings-title.tsx"],
      reason: "1 staged source file(s)",
    });
  });

  it("checks staged source files with JSX text", async () => {
    const desktopRoot = await createDesktopRoot();
    const sourceFile = await writeDesktopFile(
      desktopRoot,
      "src/features/settings/settings-title.tsx",
      "export function SettingsTitle() { return <h1>Settings</h1>; }\n",
    );

    const selected = await selectLintInput({
      desktopRoot,
      files: [sourceFile],
      forceFull: false,
    });

    expect(selected).toEqual({
      input: ["src/features/settings/settings-title.tsx"],
      reason: "1 staged source file(s)",
    });
  });

  it("runs the full project when locales change", async () => {
    const desktopRoot = await createDesktopRoot();

    const selected = await selectLintInput({
      desktopRoot,
      files: [join(desktopRoot, "src/locales/en-US/common.json")],
      forceFull: false,
    });

    expect(selected).toEqual({
      input: ["src/**/*.{ts,tsx}", "!src/test/**"],
      reason: "locale or config changed",
    });
  });
});
