import {
  type AttachmentUploadKind,
  buildDaemonAttachmentUploadUrl,
  type DocumentAttachment,
  type ImageAttachment,
} from "@cocurdex/shared";
import { resolveLocalDaemonConnection } from "./daemon-client";

interface UploadResultByKind {
  image: ImageAttachment;
  document: DocumentAttachment;
}

async function readUploadError(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {}
  return `Attachment upload failed (HTTP ${response.status})`;
}

export async function uploadAttachment<K extends AttachmentUploadKind>(
  kind: K,
  file: Blob,
  name: string,
): Promise<UploadResultByKind[K]> {
  const connection = await resolveLocalDaemonConnection();
  const response = await fetch(
    buildDaemonAttachmentUploadUrl(connection.webSocketUrl, kind, name),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    },
  );
  if (!response.ok) throw new Error(await readUploadError(response));
  return (await response.json()) as UploadResultByKind[K];
}
