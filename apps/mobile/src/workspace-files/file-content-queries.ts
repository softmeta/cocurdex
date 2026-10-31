import { RemoteFileError, type SavedHost } from "@cocurdex/client-runtime";
import { workspaceImageMimeType } from "@cocurdex/shared";
import useSWR, { preload } from "swr";
import { readRemoteRange } from "@/connection";
import { hosts } from "@/hosts";
import {
  FileLoadError,
  fileLoadFailure,
  MAX_PREVIEW_BYTES,
  readFileContent,
} from "./file-content";

export function workspaceFileRequest(filePath: string) {
  return { kind: "workspaceFile", path: filePath } as const;
}

async function fetchFileContent(hostId: string, filePath: string) {
  try {
    const { size, bytes } = await readRemoteRange(hostId, {
      ...workspaceFileRequest(filePath),
      range: { start: 0, end: MAX_PREVIEW_BYTES - 1 },
    });
    return readFileContent(bytes, size);
  } catch (error) {
    if (error instanceof RemoteFileError) {
      throw new FileLoadError(fileLoadFailure(error.reason));
    }
    throw error;
  }
}

function fileContentKey(hostId: string, filePath: string) {
  return ["files.raw", hostId, filePath] as const;
}

export function useFileContent(host: SavedHost, filePath: string) {
  return useSWR(
    fileContentKey(host.hostId, filePath),
    () => fetchFileContent(host.hostId, filePath),
    { dedupingInterval: 0 },
  );
}

export function preloadFileContent(hostId: string, filePath: string) {
  const host = hosts.getSnapshot().find((saved) => saved.hostId === hostId);
  if (!host || workspaceImageMimeType(filePath)) return;
  preload(fileContentKey(hostId, filePath), () =>
    fetchFileContent(hostId, filePath),
  ).catch(() => undefined);
}
