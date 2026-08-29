import type { ImageAttachment } from "@cocurdex/shared";
import { isDocumentAttachment, isImageAttachment } from "@cocurdex/shared";
import {
  CornerDownLeft,
  FileText,
  Image as ImageIcon,
  ListEnd,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Text,
  Textarea,
} from "@/components/ui";
import {
  DocumentAttachmentChips,
  ImageAttachmentChips,
  ImageAttachmentPreview,
} from "@/features/composer";
import type { QueuedAgentInputItem } from "./queued-input-store";

interface QueuedInputShelfProps {
  items: QueuedAgentInputItem[];
  supportsSteering: boolean;
  onDelete(item: QueuedAgentInputItem): Promise<void>;
  onSteer(item: QueuedAgentInputItem): Promise<void>;
  onUpdate(item: QueuedAgentInputItem, content: string): Promise<void>;
}

interface QueuedInputRowProps extends Omit<QueuedInputShelfProps, "items"> {
  item: QueuedAgentInputItem;
}

function QueuedInputRow({
  item,
  supportsSteering,
  onDelete,
  onSteer,
  onUpdate,
}: QueuedInputRowProps) {
  const { t } = useTranslation("agent");
  const [draft, setDraft] = useState(item.message.content);
  const [editing, setEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "delete" | "steer" | "update" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] =
    useState<ImageAttachment | null>(null);
  const imageCount = item.message.attachments.filter(isImageAttachment).length;
  const documentCount =
    item.message.attachments.filter(isDocumentAttachment).length;

  const imagePreview = previewAttachment ? (
    <ImageAttachmentPreview
      attachment={previewAttachment}
      onClose={() => setPreviewAttachment(null)}
    />
  ) : null;

  const runAction = async (
    action: NonNullable<typeof pendingAction>,
    callback: () => Promise<void>,
  ) => {
    setPendingAction(action);
    setError(null);
    try {
      await callback();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : t("queue.actionFailed"),
      );
    } finally {
      setPendingAction(null);
    }
  };

  if (editing) {
    return (
      <div className="flex min-w-0 flex-col gap-2 px-3 py-2.5">
        <Textarea
          aria-label={t("queue.editLabel")}
          autoFocus
          className="min-h-20 resize-y rounded-control border-chat-border-soft bg-chat-canvas text-body text-chat-fg"
          disabled={pendingAction !== null}
          onChange={(event) => setDraft(event.target.value)}
          value={draft}
        />
        {imagePreview}
        {error ? (
          <Text size="meta" tone="destructive">
            {error}
          </Text>
        ) : null}
        {/* Thumbnails share the action row so the buttons stay near the editor. */}
        <div className="flex min-w-0 items-end justify-between gap-2">
          <ImageAttachmentChips
            attachments={item.message.attachments}
            onPreview={setPreviewAttachment}
          />
          <DocumentAttachmentChips attachments={item.message.attachments} />
          <div className="ms-auto flex shrink-0 items-center gap-1.5">
            <Button
              disabled={pendingAction !== null}
              onClick={() => {
                setDraft(item.message.content);
                setEditing(false);
                setError(null);
              }}
              size="sm"
              variant="ghost"
            >
              {t("queue.cancel")}
            </Button>
            <Button
              // Attachment-only queued messages stay saveable with empty text.
              disabled={
                (!draft.trim() && item.message.attachments.length === 0) ||
                pendingAction !== null
              }
              onClick={() => {
                void runAction("update", async () => {
                  await onUpdate(item, draft);
                  setEditing(false);
                });
              }}
              size="sm"
            >
              {t("queue.save")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group min-w-0">
      <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5">
        <ListEnd
          aria-hidden="true"
          className="size-4 shrink-0 text-chat-fg-subtle"
        />
        {imageCount > 0 ? (
          <span className="flex shrink-0 items-center gap-1 text-chat-fg-subtle">
            <ImageIcon aria-hidden="true" className="size-3.5" />
            <Text size="meta">{imageCount}</Text>
          </span>
        ) : null}
        {documentCount > 0 ? (
          <span className="flex shrink-0 items-center gap-1 text-chat-fg-subtle">
            <FileText aria-hidden="true" className="size-3.5" />
            <Text size="meta">{documentCount}</Text>
          </span>
        ) : null}
        <Text className="min-w-0 flex-1 text-chat-fg" size="body" truncate>
          {item.message.content}
        </Text>
        {supportsSteering ? (
          <Button
            disabled={pendingAction !== null}
            onClick={() => {
              void runAction("steer", () => onSteer(item));
            }}
            size="sm"
            variant="ghost"
          >
            <CornerDownLeft className="size-3.5" />
            {t("queue.steer")}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label={t("queue.moreActions")}
              disabled={pendingAction !== null}
              size="sm"
            >
              <MoreHorizontal className="size-4" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-card">
            <DropdownMenuItem
              onClick={() => {
                setDraft(item.message.content);
                setEditing(true);
                setError(null);
              }}
            >
              <Pencil className="size-4" />
              {t("queue.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void runAction("delete", () => onDelete(item));
              }}
              variant="destructive"
            >
              <Trash2 className="size-4" />
              {t("queue.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error ? (
        <Text as="p" className="px-8 pb-1.5" size="meta" tone="destructive">
          {error}
        </Text>
      ) : null}
    </div>
  );
}

export function QueuedInputShelf({
  items,
  ...rowProps
}: QueuedInputShelfProps) {
  const { t } = useTranslation("agent");
  if (items.length === 0) return null;

  return (
    <section
      aria-label={t("queue.label")}
      className="max-h-44 overflow-y-auto rounded-card border border-chat-border-soft bg-chat-surface-raised shadow-chat-soft divide-y divide-chat-border-soft"
    >
      {items.map((item) => (
        <QueuedInputRow key={item.messageId} item={item} {...rowProps} />
      ))}
    </section>
  );
}
