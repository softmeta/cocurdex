import { type SavedHost, savedHostEndpoint } from "@cocurdex/client-runtime";
import { buildDaemonFileUrl, workspaceImageMimeType } from "@cocurdex/shared";
import useSWR, { preload } from "swr";
import { hosts } from "@/hosts";
import { MAX_PREVIEW_BYTES, readFileContent } from "./file-content";

export function workspaceFileSource(
  host: Pick<SavedHost, "baseUrl" | "token">,
  filePath: string,
) {
  const { webSocketUrl, token } = savedHostEndpoint(host);
  return {
    uri: buildDaemonFileUrl(webSocketUrl, filePath),
    headers: { Authorization: `Bearer ${token}` },
  };
}

async function fetchFileContent(host: SavedHost, filePath: string) {
  const source = workspaceFileSource(host, filePath);
  const response = await fetch(source.uri, {
    headers: { ...source.headers, Range: `bytes=0-${MAX_PREVIEW_BYTES - 1}` },
  });
  return readFileContent(
    response.status,
    response.headers.get("content-range"),
    await response.text(),
  );
}

function fileContentKey(hostId: string, filePath: string) {
  return ["files.raw", hostId, filePath] as const;
}

export function useFileContent(host: SavedHost, filePath: string) {
  return useSWR(
    fileContentKey(host.hostId, filePath),
    () => fetchFileContent(host, filePath),
    { dedupingInterval: 0 },
  );
}

export function preloadFileContent(hostId: string, filePath: string) {
  const host = hosts.getSnapshot().find((saved) => saved.hostId === hostId);
  if (!host || workspaceImageMimeType(filePath)) return;
  preload(fileContentKey(hostId, filePath), () =>
    fetchFileContent(host, filePath),
  ).catch(() => undefined);
}
