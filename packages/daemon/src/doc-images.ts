import { createReadStream } from "node:fs";
import path from "node:path";
import {
  type DocImage,
  type DocImageFile,
  docImageMarkdown,
  docImageUri,
  type ImportDocImagePayload,
  type LocateDocImagePayload,
  parseDocImageUri,
} from "@cocurdex/shared";
import type { DaemonAttachmentStore } from "./attachment-store";

type DocImageStore = Pick<DaemonAttachmentStore, "importImage" | "locateImage">;

export async function importDocImage(
  store: DocImageStore,
  payload: ImportDocImagePayload,
): Promise<DocImage> {
  const image = await store.importImage(
    createReadStream(payload.path),
    payload.name ?? path.basename(payload.path),
  );
  const fileName = path.basename(image.filePath);
  return {
    uri: docImageUri(fileName),
    fileName,
    filePath: image.filePath,
    mimeType: image.mimeType,
    sizeBytes: image.sizeBytes,
    name: image.name,
    width: image.width,
    height: image.height,
    markdown: docImageMarkdown(fileName, image.name),
  };
}

export async function locateDocImage(
  store: DocImageStore,
  payload: LocateDocImagePayload,
): Promise<DocImageFile | null> {
  const fileName = parseDocImageUri(payload.uri);
  if (!fileName) {
    throw new Error(
      `Not a Cocurdex image reference: ${payload.uri} (expected cocurdex://image/<file>)`,
    );
  }
  const located = await store.locateImage(fileName);
  if (!located) return null;
  return {
    uri: docImageUri(fileName),
    fileName,
    filePath: located.path,
    mimeType: located.mimeType,
    sizeBytes: located.size,
  };
}
