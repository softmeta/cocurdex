import { storedImageFileName } from "./doc-images";

export const DAEMON_ATTACHMENT_HTTP_PATH = "/attachments";
export const DAEMON_ATTACHMENT_NAME_QUERY = "name";
export const DAEMON_ATTACHMENT_FILE_QUERY = "file";

export type AttachmentUploadKind = "image" | "document";

function attachmentUrl(webSocketUrl: string, pathname: string) {
  const url = new URL(pathname, webSocketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url;
}

export function buildDaemonAttachmentUploadUrl(
  webSocketUrl: string,
  kind: AttachmentUploadKind,
  name: string,
) {
  const url = attachmentUrl(
    webSocketUrl,
    `${DAEMON_ATTACHMENT_HTTP_PATH}/${kind}`,
  );
  url.searchParams.set(DAEMON_ATTACHMENT_NAME_QUERY, name);
  return url.toString();
}

export function buildDaemonImageAttachmentUrl(
  webSocketUrl: string,
  filePath: string,
) {
  const url = attachmentUrl(
    webSocketUrl,
    `${DAEMON_ATTACHMENT_HTTP_PATH}/image`,
  );
  url.searchParams.set(
    DAEMON_ATTACHMENT_FILE_QUERY,
    storedImageFileName(filePath),
  );
  return url.toString();
}
