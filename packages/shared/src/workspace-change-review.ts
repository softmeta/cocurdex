import type { TurnFileReviewKind } from "./workspace-changes";

const DOCUMENT_EXTENSIONS = new Set([
  ".doc",
  ".docx",
  ".odt",
  ".rtf",
  ".pdf",
  ".pages",
]);

const SPREADSHEET_EXTENSIONS = new Set([
  ".xls",
  ".xlsx",
  ".xlsm",
  ".ods",
  ".numbers",
]);

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".svg",
  ".tif",
  ".tiff",
  ".avif",
  ".heic",
]);

const TEXT_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".jsonc",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".htm",
  ".xml",
  ".yml",
  ".yaml",
  ".toml",
  ".csv",
  ".tsv",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".h",
  ".cc",
  ".cpp",
  ".hpp",
  ".rb",
  ".php",
  ".sh",
  ".zsh",
  ".bash",
  ".ps1",
  ".sql",
  ".graphql",
  ".env",
  ".ini",
  ".cfg",
  ".conf",
  ".lock",
  ".gitignore",
  ".dockerignore",
]);

export function inferReviewKind(relativePath: string): TurnFileReviewKind {
  const extension = getExtension(relativePath);
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "document";
  }
  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return "spreadsheet";
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (extension === "" || TEXT_EXTENSIONS.has(extension)) {
    return "text";
  }
  return "binary";
}

export function mimeTypeForPath(relativePath: string): string | null {
  const extension = getExtension(relativePath);
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".bmp":
      return "image/bmp";
    case ".pdf":
      return "application/pdf";
    default:
      return null;
  }
}

function getExtension(relativePath: string) {
  const basename = relativePath.split(/[\\/]/).pop() ?? relativePath;
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) {
    return "";
  }
  return basename.slice(dot).toLowerCase();
}
