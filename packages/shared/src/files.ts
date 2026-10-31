export interface WorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: WorkspaceEntry[];
}

export interface WorkspaceFileRecord {
  kind: "directory" | "file";
  name: string;
  path: string;
  relativePath: string;
}

export interface McpConfigFile {
  path: string;
  content: string;
}

export function isValidMcpServerName(name: string) {
  return /^[A-Za-z0-9_-]+$/.test(name);
}

export function pathBaseName(value: string): string {
  const segments = value.split(/[\\/]+/).filter(Boolean);
  return segments.at(-1) ?? value;
}

export const DAEMON_PDF_HTTP_PATH = "/files/pdf";
export const DAEMON_PDF_PATH_QUERY = "path";

export function buildDaemonPdfUrl(webSocketUrl: string, filePath: string) {
  const url = new URL(DAEMON_PDF_HTTP_PATH, webSocketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.searchParams.set(DAEMON_PDF_PATH_QUERY, filePath);
  return url.toString();
}

export const DAEMON_FILE_HTTP_PATH = "/files/raw";
export const DAEMON_FILE_PATH_QUERY = "path";

export function buildDaemonFileUrl(webSocketUrl: string, filePath: string) {
  const url = new URL(DAEMON_FILE_HTTP_PATH, webSocketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.searchParams.set(DAEMON_FILE_PATH_QUERY, filePath);
  return url.toString();
}

const WORKSPACE_IMAGE_MIME_TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

function fileExtension(filePath: string) {
  const name = pathBaseName(filePath);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function workspaceImageMimeType(filePath: string): string | null {
  return WORKSPACE_IMAGE_MIME_TYPES[fileExtension(filePath)] ?? null;
}

export function workspaceFileContentType(filePath: string) {
  return workspaceImageMimeType(filePath) ?? "text/plain; charset=utf-8";
}
