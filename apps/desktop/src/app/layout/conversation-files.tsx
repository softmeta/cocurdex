import {
  type ImageAttachment,
  isContextFileAttachment,
  isDocumentAttachment,
  isImageAttachment,
  pathBaseName,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { FileText, Image } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState, Text } from "@/components/ui";
import { useSessionMessages } from "@/features/agent/view";
import { ImageAttachmentPreview } from "@/features/composer";
import { openFileAtom, openFilesAtom } from "@/features/editor";
import { openPdfReaderAtom } from "@/features/pdf-reader";
import { activeSessionIdAtom } from "@/features/sessions";

export function ConversationFiles() {
  const { t } = useTranslation("editor");
  const sessionId = useAtomValue(activeSessionIdAtom);
  const messages = useSessionMessages(sessionId);
  const openedFiles = useAtomValue(openFilesAtom);
  const openFile = useSetAtom(openFileAtom);
  const openPdf = useSetAtom(openPdfReaderAtom);
  const [preview, setPreview] = useState<ImageAttachment | null>(null);
  const entries = new Map<
    string,
    { path: string; name: string; image?: ImageAttachment }
  >();
  for (const message of messages) {
    for (const attachment of message.attachments) {
      if (isImageAttachment(attachment) || isDocumentAttachment(attachment)) {
        entries.set(attachment.filePath, {
          path: attachment.filePath,
          name: attachment.name,
          ...(isImageAttachment(attachment) ? { image: attachment } : {}),
        });
      } else if (isContextFileAttachment(attachment)) {
        entries.set(attachment.filePath, {
          path: attachment.filePath,
          name: pathBaseName(attachment.filePath),
        });
      }
    }
  }
  for (const path of openedFiles) {
    if (!entries.has(path))
      entries.set(path, { path, name: pathBaseName(path) });
  }
  const files = [...entries.values()];
  const images = files.flatMap((file) => (file.image ? [file.image] : []));
  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label={t("actions.conversationFiles", {
        defaultValue: "Conversation files",
      })}
    >
      <div className="shrink-0 px-3 py-2">
        <Text size="meta" tone="muted">
          {t("states.conversationFilesDescription", {
            defaultValue: "Attachments and files opened in this conversation",
          })}
        </Text>
      </div>
      {files.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={t("states.noConversationFiles", {
            defaultValue: "No conversation files",
          })}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-2">
          {files.map((file) => (
            <button
              type="button"
              key={file.path}
              data-item-path={file.path}
              className="flex w-full items-center gap-2 rounded-control px-2 py-2 text-start text-body text-editor-fg hover:bg-editor-tab-hover-bg"
              onClick={() => {
                if (file.image) setPreview(file.image);
                else if (/\.pdf$/i.test(file.path)) openPdf(file.path);
                else openFile(file.path);
              }}
            >
              {file.image ? (
                <Image className="size-3.5 shrink-0" />
              ) : (
                <FileText className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{file.name}</span>
            </button>
          ))}
        </div>
      )}
      {preview ? (
        <ImageAttachmentPreview
          attachment={preview}
          gallery={images}
          onSelect={setPreview}
          onClose={() => setPreview(null)}
        />
      ) : null}
    </section>
  );
}
