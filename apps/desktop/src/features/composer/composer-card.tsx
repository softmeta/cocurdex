import {
  type ImageAttachment,
  isImageAttachment,
  type MessageAttachment,
} from "@cocurdex/shared";
import { CornerDownLeft, Plus } from "lucide-react";
import type { ClipboardEvent, ReactNode, RefObject } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { cn } from "@/lib";
import {
  composerSendButtonClassName,
  composerStopButtonClassName,
  composerStopGlyphClassName,
} from "./chat-composer-layout";
import { ContextAttachmentChips } from "./context-attachment-chips";
import { ContextFileMentionMenu } from "./context-file-mentions";
import { ContextWindowIndicator } from "./context-window-indicator";
import { DocumentAttachmentChips } from "./document-attachment-chips";
import {
  ImageAttachmentChips,
  ImageAttachmentPreview,
} from "./image-attachments";
import type {
  MentionAnchor,
  MentionEditorChange,
  MentionEditorHandle,
  MentionEditorProps,
} from "./mention-editor";
import { MentionEditor } from "./mention-editor";
import type { SendShortcut } from "./send-shortcut";
import { SlashCommandMenu } from "./slash-command-menu";
import type { ContextFileMentionsState } from "./use-context-file-mentions";
import type { SlashCommandsState } from "./use-slash-commands";

interface ComposerCardProps {
  composerAttachments: MessageAttachment[];
  contextAttachments: MessageAttachment[];
  contextChips?: ReactNode;
  attachmentError: string | null;
  isRunning: boolean;
  canSend: boolean;
  isAgentMode: boolean;
  runtimeControls: boolean;
  footerLeading?: ReactNode;
  footerTrailing?: ReactNode;
  runtimeMenuExtras?: ReactNode;
  modelLeading?: ReactNode;
  sessionId?: string | null;
  mentionAnchor: MentionAnchor | null;
  placeholderOverride?: string;
  resolvedControls: ReactNode;
  attachMenuContent: ReactNode;
  contextFileMentions: ContextFileMentionsState;
  slashCommands: SlashCommandsState;
  editorRef: RefObject<MentionEditorHandle | null>;
  initialEditorContent?: MentionEditorProps["initialContent"];
  onEditorChange(next: MentionEditorChange): void;
  onMentionAnchorChange(anchor: MentionAnchor | null): void;
  onPaste(event: ClipboardEvent<HTMLDivElement>): void;
  onSubmit(useOppositeFollowUpBehavior?: boolean): void;
  onRemoveAttachment(index: number): void;
  onStop?(): void;
  sendShortcut: SendShortcut;
}

export function ComposerCard({
  composerAttachments,
  contextAttachments,
  contextChips,
  attachmentError,
  isRunning,
  canSend,
  isAgentMode,
  runtimeControls,
  footerLeading,
  footerTrailing,
  runtimeMenuExtras,
  modelLeading,
  sessionId,
  mentionAnchor,
  placeholderOverride,
  resolvedControls,
  attachMenuContent,
  contextFileMentions,
  slashCommands,
  editorRef,
  initialEditorContent,
  onEditorChange,
  onMentionAnchorChange,
  onPaste,
  onSubmit,
  onRemoveAttachment,
  onStop,
  sendShortcut,
}: ComposerCardProps) {
  const { t } = useTranslation(["common", "sessions"]);
  const [previewAttachment, setPreviewAttachment] =
    useState<ImageAttachment | null>(null);
  const placeholder =
    placeholderOverride ?? t("sessions:composer.sendFollowUpCompact");
  const hasExtras =
    Boolean(attachmentError) ||
    Boolean(contextChips) ||
    contextAttachments.length > 0 ||
    composerAttachments.some(
      (attachment) =>
        attachment.kind === "document" || attachment.kind === "image",
    );
  const singleRow =
    !footerLeading &&
    !footerTrailing &&
    !resolvedControls &&
    !(isAgentMode && runtimeControls);

  const attachButton = (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  aria-label={t("common:actions.attach")}
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-transparent text-chat-fg-muted transition-colors hover:bg-chat-surface-control-hover hover:text-chat-fg"
                >
                  <Plus className="size-4" />
                </button>
              }
            />
          }
        />
        <TooltipContent side="top" sideOffset={6}>
          {t("common:actions.attach")}
        </TooltipContent>
      </Tooltip>
      {attachMenuContent}
    </DropdownMenu>
  );
  const sendButtons = (
    <div className="flex shrink-0 items-center gap-1.5">
      {isRunning ? (
        <Button
          aria-label={t("common:actions.stop")}
          type="button"
          onClick={onStop}
          size="icon-sm"
          className={composerStopButtonClassName()}
        >
          <span className={composerStopGlyphClassName()} />
        </Button>
      ) : null}
      {!isRunning || canSend ? (
        <Button
          aria-label={t("common:actions.send")}
          type="submit"
          disabled={!canSend}
          size="icon-sm"
          className={composerSendButtonClassName(canSend)}
        >
          <CornerDownLeft className="size-4" />
        </Button>
      ) : null}
    </div>
  );
  const editor = (
    <div
      className={cn(
        "relative min-w-0",
        singleRow && "flex-1 px-1",
        !singleRow && "px-2",
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
        ariaLabel={placeholder}
        initialContent={initialEditorContent}
        onChange={onEditorChange}
        onKeyDown={(event) => {
          slashCommands.handleKeyDown(event);
          if (event.defaultPrevented) return;
          contextFileMentions.handleKeyDown(event);
        }}
        onMentionQueryChange={contextFileMentions.handleMentionQueryChange}
        onSlashQueryChange={slashCommands.handleSlashQueryChange}
        onMentionAnchorChange={onMentionAnchorChange}
        onPaste={onPaste}
        onSubmit={onSubmit}
        placeholder={placeholder}
        ref={editorRef}
        removeMentionLabel={t("sessions:composer.removeAttachment")}
        sendShortcut={sendShortcut}
        className={cn(
          "max-h-40 resize-none overflow-y-auto overscroll-contain rounded-none border-0 bg-transparent px-0 py-1.5 text-body text-chat-fg shadow-none outline-none placeholder:text-chat-fg-muted focus-visible:ring-0 dark:bg-transparent",
          singleRow && "min-h-8",
          !singleRow && "min-h-10",
        )}
      />
    </div>
  );

  return (
    <>
      {previewAttachment ? (
        <ImageAttachmentPreview
          attachment={previewAttachment}
          gallery={composerAttachments.filter(isImageAttachment)}
          onClose={() => setPreviewAttachment(null)}
          onSelect={setPreviewAttachment}
        />
      ) : null}
      <div
        className={cn(
          "flex flex-col rounded-panel border border-chat-border bg-chat-surface-input",
          singleRow && "p-1.5",
          !singleRow && "p-2",
        )}
      >
        {hasExtras ? (
          <div className="mb-1 flex min-w-0 flex-col gap-1.5 px-1 pt-1">
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
                removeAttachmentLabel={t("sessions:composer.removeAttachment")}
              />
            ) : null}
            {contextChips}
            {attachmentError ? (
              <div className="text-xs text-destructive">{attachmentError}</div>
            ) : null}
          </div>
        ) : null}
        {singleRow ? (
          <div className="flex min-w-0 items-end gap-1 text-chat-fg-muted">
            {attachButton}
            {editor}
            {sendButtons}
          </div>
        ) : (
          <>
            {editor}
            <div className="flex h-8 min-w-0 items-center gap-1 text-xs text-chat-fg-muted">
              {attachButton}
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {footerLeading}
                {resolvedControls}
                {isAgentMode && runtimeControls ? (
                  <ContextWindowIndicator
                    afterModel={footerTrailing}
                    footer={runtimeMenuExtras}
                    modelLeading={modelLeading}
                    isRunning={isRunning}
                    layout="split"
                    sessionId={sessionId}
                  />
                ) : null}
                {!isAgentMode && footerTrailing ? (
                  <div className="ms-auto flex shrink-0 items-center gap-1">
                    {footerTrailing}
                  </div>
                ) : null}
              </div>
              {sendButtons}
            </div>
          </>
        )}
      </div>
    </>
  );
}
