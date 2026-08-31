import type { ImageAttachment, MessageAttachment } from "@cocurdex/shared";
import { CornerDownLeft, Plus } from "lucide-react";
import type { ClipboardEvent, ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, DropdownMenu, DropdownMenuTrigger } from "@/components/ui";
import { cn } from "@/lib";
import {
  getCollapsedPillTextareaWidth,
  getNextPillExpandedState,
  getPillComposerShapeClassName,
  getSingleLineTextareaHeight,
  measureWrappedTextareaHeight,
} from "./chat-composer-layout";
import { ContextAttachmentChips } from "./context-attachment-chips";
import {
  ContextFileMentionMenu,
  type ContextFileMentionsState,
} from "./context-file-mentions";
import { ContextWindowIndicator } from "./context-window-indicator";
import { DocumentAttachmentChips } from "./document-attachment-chips";
import {
  ImageAttachmentChips,
  ImageAttachmentPreview,
} from "./image-attachments";
import type {
  MentionAnchor,
  MentionableAttachment,
  MentionEditorChange,
  MentionEditorHandle,
} from "./mention-editor";
import { MentionEditor } from "./mention-editor";
import type { SendShortcut } from "./send-shortcut";
import {
  SlashCommandMenu,
  type SlashCommandsState,
} from "./slash-command-menu";

function pillGridRowClassName(row: 1 | 2 | 3) {
  if (row === 3) {
    return "row-start-3";
  }
  if (row === 2) {
    return "row-start-2";
  }
  return "row-start-1";
}

interface PillComposerProps {
  composerAttachments: MessageAttachment[];
  contextAttachments: MessageAttachment[];
  attachmentError: string | null;
  isRunning: boolean;
  canSend: boolean;
  isAgentMode: boolean;
  footerLeading?: ReactNode;
  footerTrailing?: ReactNode;
  runtimeMenuExtras?: ReactNode;
  mentionAnchor: MentionAnchor | null;
  placeholderOverride?: string;
  resolvedControls: ReactNode;
  attachMenuContent: ReactNode;
  contextFileMentions: ContextFileMentionsState;
  slashCommands: SlashCommandsState;
  text: string;
  mentions: MentionableAttachment[];
  editorRef: RefObject<MentionEditorHandle | null>;
  onEditorChange(next: MentionEditorChange): void;
  onMentionAnchorChange(anchor: MentionAnchor | null): void;
  onPaste(event: ClipboardEvent<HTMLDivElement>): void;
  onSubmit(useOppositeFollowUpBehavior?: boolean): void;
  onRemoveAttachment(index: number): void;
  onStop?(): void;
  sendShortcut: SendShortcut;
}

export function PillComposer({
  composerAttachments,
  contextAttachments,
  attachmentError,
  isRunning,
  canSend,
  isAgentMode,
  footerLeading,
  footerTrailing,
  runtimeMenuExtras,
  mentionAnchor,
  placeholderOverride,
  resolvedControls,
  attachMenuContent,
  contextFileMentions,
  slashCommands,
  text,
  mentions,
  editorRef,
  onEditorChange,
  onMentionAnchorChange,
  onPaste,
  onSubmit,
  onRemoveAttachment,
  onStop,
  sendShortcut,
}: PillComposerProps) {
  const { t } = useTranslation(["common", "sessions"]);
  const pillComposerRef = useRef<HTMLDivElement | null>(null);
  const pillActionGroupRef = useRef<HTMLDivElement | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const [isPillExpanded, setIsPillExpanded] = useState(false);
  const [previewAttachment, setPreviewAttachment] =
    useState<ImageAttachment | null>(null);

  useLayoutEffect(() => {
    const container = editorContainerRef.current;
    const composer = pillComposerRef.current;
    const actionGroup = pillActionGroupRef.current;
    if (!container || !composer || !actionGroup) return;

    if (text.length === 0 && mentions.length === 0) {
      setIsPillExpanded(false);
      return;
    }

    const updateExpandedState = () => {
      const editorEl = container.querySelector(
        ".mention-editor",
      ) as HTMLElement | null;
      if (!editorEl) return;
      const style = window.getComputedStyle(editorEl);
      const singleLineHeight = getSingleLineTextareaHeight(style);
      const measuredHeight = editorEl.scrollHeight;
      const collapsedWidth = getCollapsedPillTextareaWidth(
        composer,
        actionGroup,
      );
      const collapsedHeight = measureWrappedTextareaHeight({
        source: editorEl,
        style,
        width: collapsedWidth,
      });

      setIsPillExpanded((current) => {
        const next = getNextPillExpandedState({
          collapsedHeight,
          current,
          renderedHeight: measuredHeight,
          singleLineHeight,
        });
        return current === next ? current : next;
      });
    };

    updateExpandedState();

    const resizeObserver = new ResizeObserver(updateExpandedState);
    resizeObserver.observe(composer);
    resizeObserver.observe(actionGroup);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [mentions.length, text]);

  const hasComposerExtras =
    Boolean(attachmentError) ||
    contextAttachments.length > 0 ||
    composerAttachments.some(
      (attachment) =>
        attachment.kind === "document" || attachment.kind === "image",
    );
  const isExpanded = isPillExpanded || hasComposerExtras;
  let editorRow: 1 | 2 = 1;
  let actionRow: 1 | 2 | 3 = 1;
  if (hasComposerExtras) {
    editorRow = 2;
    actionRow = 3;
  } else if (isExpanded) {
    actionRow = 2;
  }

  return (
    <>
      {previewAttachment ? (
        <ImageAttachmentPreview
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      ) : null}
      <div className="flex flex-col gap-1">
        <div
          ref={pillComposerRef}
          className={cn(
            "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-1 border border-chat-border bg-chat-surface-input px-3 shadow-chat-soft",
            getPillComposerShapeClassName(isExpanded),
            isExpanded && "min-h-12 py-2",
            !isExpanded && "h-12",
          )}
        >
          {hasComposerExtras ? (
            <div className="col-span-3 row-start-1 mb-1 flex min-w-0 flex-col gap-1.5">
              <ImageAttachmentChips
                attachments={composerAttachments}
                onPreview={setPreviewAttachment}
                onRemoveAttachment={onRemoveAttachment}
              />
              <DocumentAttachmentChips
                attachments={composerAttachments}
                onRemoveAttachment={onRemoveAttachment}
                removeAttachmentLabel={t("sessions:composer.removeAttachment")}
              />
              {contextAttachments.length > 0 ? (
                <ContextAttachmentChips
                  attachments={contextAttachments}
                  onRemoveAttachment={onRemoveAttachment}
                  removeAttachmentLabel={t(
                    "sessions:composer.removeAttachment",
                  )}
                />
              ) : null}
              {attachmentError ? (
                <div className="text-xs text-destructive">
                  {attachmentError}
                </div>
              ) : null}
            </div>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={t("common:actions.attach")}
                type="button"
                className={cn(
                  "col-start-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-transparent text-chat-fg-muted transition-colors hover:bg-chat-surface-control-hover hover:text-chat-fg",
                  pillGridRowClassName(actionRow),
                )}
              >
                <Plus className="size-4" />
              </button>
            </DropdownMenuTrigger>
            {attachMenuContent}
          </DropdownMenu>
          <div
            className={cn(
              "relative min-w-0",
              pillGridRowClassName(editorRow),
              isExpanded && "col-span-3",
              !isExpanded && "col-start-2",
            )}
          >
            <ContextFileMentionMenu
              anchor={mentionAnchor}
              files={contextFileMentions.matchingFiles}
              highlightedIndex={contextFileMentions.highlightedIndex}
              isOpen={contextFileMentions.isOpen}
              menuRef={contextFileMentions.menuRef}
              onSelect={contextFileMentions.selectFile}
            />
            <SlashCommandMenu
              anchor={mentionAnchor}
              commands={slashCommands.matchingCommands}
              highlightedIndex={slashCommands.highlightedIndex}
              isOpen={slashCommands.isOpen}
              menuRef={slashCommands.menuRef}
              onHighlightIndex={slashCommands.setHighlightedIndex}
              onSelect={slashCommands.selectCommand}
            />
            <MentionEditor
              ariaLabel={t("sessions:composer.sendFollowUpCompact")}
              containerRef={editorContainerRef}
              onChange={onEditorChange}
              onKeyDown={(event) => {
                slashCommands.handleKeyDown(event);
                if (event.defaultPrevented) return;
                contextFileMentions.handleKeyDown(event);
              }}
              onMentionQueryChange={
                contextFileMentions.handleMentionQueryChange
              }
              onSlashQueryChange={slashCommands.handleSlashQueryChange}
              onMentionAnchorChange={onMentionAnchorChange}
              onPaste={onPaste}
              onSubmit={onSubmit}
              placeholder={
                placeholderOverride ??
                t("sessions:composer.sendFollowUpCompact")
              }
              ref={editorRef}
              removeMentionLabel={t("sessions:composer.removeAttachment")}
              sendShortcut={sendShortcut}
              className={cn(
                "min-h-10 resize-none rounded-none border-0 bg-transparent px-0 py-2 text-body text-chat-fg shadow-none outline-none placeholder:text-chat-fg-muted focus-visible:ring-0 dark:bg-transparent",
                isExpanded && "max-h-32 overflow-y-auto",
                !isExpanded &&
                  "grid h-10 max-h-10 min-h-10 items-center overflow-hidden",
              )}
            />
          </div>
          <div
            ref={pillActionGroupRef}
            className={cn(
              // Same gap as the panel composer's action group so stop + send
              // never sit flush against each other while a turn is running.
              "col-start-3 flex items-center gap-1.5 justify-self-end",
              pillGridRowClassName(actionRow),
            )}
          >
            {isRunning ? (
              <Button
                aria-label={t("common:actions.stop")}
                type="button"
                onClick={onStop}
                size="icon-sm"
                className={cn(
                  "size-8 rounded-full bg-chat-fg text-chat-canvas shadow-chat-soft transition-colors hover:bg-chat-fg-secondary",
                )}
              >
                <div className="flex size-3 items-center justify-center rounded-control bg-current" />
              </Button>
            ) : null}
            {!isRunning || canSend ? (
              <Button
                aria-label={t("common:actions.send")}
                type="submit"
                disabled={!canSend}
                size="icon-sm"
                className={cn(
                  "size-8 rounded-full shadow-chat-soft transition-colors",
                  canSend
                    ? "bg-chat-fg text-chat-canvas hover:bg-chat-fg-secondary"
                    : "bg-chat-surface-disabled text-chat-fg-muted hover:bg-chat-surface-disabled",
                )}
              >
                <CornerDownLeft className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex min-h-8 items-center justify-between gap-3 px-3 text-xs text-chat-fg-muted">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {footerLeading}
            {resolvedControls}
            {isAgentMode ? (
              <ContextWindowIndicator
                afterModel={footerTrailing}
                footer={runtimeMenuExtras}
                layout="split"
              />
            ) : null}
          </div>
          {!isAgentMode && footerTrailing ? (
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {footerTrailing}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
