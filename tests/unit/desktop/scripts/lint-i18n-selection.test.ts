import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { selectLintInput } from "@desktop/scripts/lint-i18n-selection.mjs";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

async function createDesktopRoot() {
  const tempDir = await tempDirs.create("cocurdex-i18n-selection-repo");
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
    await tempDirs.cleanup();
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
      input: ["src/**/*.{ts,tsx}"],
      reason: "locale or config changed",
    });
  });
});
