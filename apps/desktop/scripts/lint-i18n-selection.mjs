import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export const FULL_INPUT = ["src/**/*.{ts,tsx}", "!src/test/**"];

const SOURCE_FILE_PATTERN = /^src\/(?!test\/).*\.(ts|tsx)$/;
const LOCALE_FILE_PATTERN = /^src\/locales\/.*\.json$/;
const CONFIG_FILE = "i18next.config.ts";
const I18N_API_PATTERN =
  /\b(?:t|i18n)\s*\(|\buseTranslation\s*\(|<Trans\b|\bi18nKey\s*=/;
const JSX_TEXT_PATTERN = />\s*[^<>{}\s][^<>{}]*[A-Za-z][^<>{}]*\s*</;
const LOCALIZABLE_ATTRIBUTE_PATTERN =
  /\b(?:aria-label|aria-description|title|placeholder|alt|label)\s*=\s*["'][^"']*[A-Za-z]/;

function normalizeInputPath(filePath, repoRoot, desktopRoot) {
  const withoutQuotes = filePath.replace(/^['"]|['"]$/g, "");
  const absolutePath = isAbsolute(withoutQuotes)
    ? withoutQuotes
    : resolve(repoRoot, withoutQuotes);
  const desktopRelativePath = relative(desktopRoot, absolutePath).replaceAll(
    "\\",
    "/",
  );
  if (desktopRelativePath.startsWith("../")) return null;
  return desktopRelativePath;
}

async function isI18nSensitiveSourceFile(desktopRoot, filePath) {
  if (!existsSync(join(desktopRoot, filePath))) return false;

  const source = await readFile(join(desktopRoot, filePath), "utf-8");
  return (
    I18N_API_PATTERN.test(source) ||
    JSX_TEXT_PATTERN.test(source) ||
    LOCALIZABLE_ATTRIBUTE_PATTERN.test(source)
  );
}

export async function selectLintInput({
  desktopRoot,
  files,
  forceFull,
  repoRoot,
}) {
  if (forceFull || files.length === 0) {
    return { input: FULL_INPUT, reason: "full project" };
  }

  const resolvedRepoRoot = repoRoot ?? resolve(desktopRoot, "../..");
  const desktopFiles = [
    ...new Set(
      files
        .map((file) => normalizeInputPath(file, resolvedRepoRoot, desktopRoot))
        .filter(Boolean),
    ),
  ];
  const needsFullScan = desktopFiles.some(
    (file) => file === CONFIG_FILE || LOCALE_FILE_PATTERN.test(file),
  );

  if (needsFullScan) {
    return { input: FULL_INPUT, reason: "locale or config changed" };
  }

  const sourceFiles = desktopFiles.filter((file) =>
    SOURCE_FILE_PATTERN.test(file),
  );
  const sensitiveSourceFiles = [];

  for (const file of sourceFiles) {
    if (await isI18nSensitiveSourceFile(desktopRoot, file)) {
      sensitiveSourceFiles.push(file);
    }
  }

  if (sensitiveSourceFiles.length === 0) {
    return { input: [], reason: "no i18n-sensitive source files" };
  }

  return {
    input: sensitiveSourceFiles,
    reason: `${sensitiveSourceFiles.length} staged source file(s)`,
  };
}
