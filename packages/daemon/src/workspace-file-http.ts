import type http from "node:http";
import {
  DAEMON_FILE_HTTP_PATH,
  DAEMON_FILE_PATH_QUERY,
  workspaceFileContentType,
} from "@cocurdex/shared";
import {
  createRangeFileHttpHandler,
  type RangeFileHttpHandlerOptions,
  readRequestUrl,
} from "./pdf-http";

export interface WorkspaceFileHttpHandlerOptions
  extends RangeFileHttpHandlerOptions {
  resolveFilePath(filePath: string): Promise<string>;
}

export function isWorkspaceFileHttpRequest(request: http.IncomingMessage) {
  return readRequestUrl(request)?.pathname === DAEMON_FILE_HTTP_PATH;
}

export function createWorkspaceFileHttpHandler(
  options: WorkspaceFileHttpHandlerOptions,
) {
  return createRangeFileHttpHandler({
    ...options,
    pathQuery: DAEMON_FILE_PATH_QUERY,
    resolvePath: options.resolveFilePath,
    contentHeaders: (filePath) => ({
      "Content-Type": workspaceFileContentType(filePath),
      "Content-Security-Policy": "default-src 'none'; sandbox",
    }),
  });
}
