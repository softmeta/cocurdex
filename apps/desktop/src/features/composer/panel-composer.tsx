import {
  type ImageAttachment,
  isImageAttachment,
  type MessageAttachment,
} from "@cocurdex/shared";
import { CornerDownLeft, Plus } from "lucide-react";
import type { ClipboardEvent, ReactNode, RefObject } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui";
import { cn } from "@/lib";
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
  MentionEditorChange,
  MentionEditorHandle,
  MentionEditorProps,
} from "./mention-editor";
import { MentionEditor } from "./mention-editor";
import type { SendShortcut } from "./send-shortcut";
import {
  SlashCommandMenu,
  type SlashCommandsState,
} from "./slash-command-menu";

interface PanelComposerProps {
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
  mentionMenuPlacement?: "top" | "bottom";
  resolvedControls: ReactNode;
  attachMenuContent: ReactNode;
  contextFileMentions: ContextFileMentionsState;
  slashCommands: SlashCommandsState;
  tone: "chat" | "welcome";
  header?: ReactNode;
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

export function PanelComposer({
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
  mentionMenuPlacement = "top",
  resolvedControls,
  attachMenuContent,
  contextFileMentions,
  slashCommands,
  tone,
  header,
  editorRef,
  initialEditorContent,
  onEditorChange,
  onMentionAnchorChange,
  onPaste,
  onSubmit,
  onRemoveAttachment,
  onStop,
  sendShortcut,
}: PanelComposerProps) {
  const { t } = useTranslation(["common", "sessions"]);
  const [previewAttachment, setPreviewAttachment] =
    useState<ImageAttachment | null>(null);

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
          "overflow-hidden rounded-panel border",
          tone === "welcome"
            ? "border-welcome-border bg-welcome-surface shadow-chat-soft"
            : "border-chat-border bg-chat-surface-input shadow-chat-soft",
        )}
      >
        {header ? (
          <div
            className={cn(
              "flex items-center border-b px-2 py-1",
              tone === "welcome"
                ? "border-welcome-border bg-welcome-surface-strong"
                : "border-chat-border bg-chat-surface-raised",
            )}
          >
            {header}
          </div>
        ) : null}
        <div className="p-3">
          {composerAttachments.some((a) => a.kind === "image") ? (
            <div className="mb-3">
              <ImageAttachmentChips
                attachments={composerAttachments}
                onPreview={setPreviewAttachment}
                onRemoveAttachment={onRemoveAttachment}
                tone={tone}
              />
            </div>
          ) : null}
          {composerAttachments.some((a) => a.kind === "document") ? (
            <div className="mb-3">
              <DocumentAttachmentChips
                attachments={composerAttachments}
                onRemoveAttachment={onRemoveAttachment}
                removeAttachmentLabel={t("sessions:composer.removeAttachment")}
                tone={tone}
              />
            </div>
          ) : null}
          {contextAttachments.length > 0 ? (
            <div className="mb-3">
              <ContextAttachmentChips
                attachments={contextAttachments}
                onRemoveAttachment={onRemoveAttachment}
                removeAttachmentLabel={t("sessions:composer.removeAttachment")}
                tone={tone}
              />
            </div>
          ) : null}
          {attachmentError ? (
            <div className="mb-3 text-xs text-destructive">
              {attachmentError}
            </div>
          ) : null}
          <div className="relative">
            <ContextFileMentionMenu
              anchor={mentionAnchor}
              files={contextFileMentions.matchingFiles}
              highlightedIndex={contextFileMentions.highlightedIndex}
              isOpen={contextFileMentions.isOpen}
              menuRef={contextFileMentions.menuRef}
              onSelect={contextFileMentions.selectFile}
              placement={mentionMenuPlacement}
              tone={tone}
            />
            <SlashCommandMenu
              anchor={mentionAnchor}
              commands={slashCommands.matchingCommands}
              highlightedIndex={slashCommands.highlightedIndex}
              isOpen={slashCommands.isOpen}
              menuRef={slashCommands.menuRef}
              onHighlightIndex={slashCommands.setHighlightedIndex}
              onSelect={slashCommands.selectCommand}
              placement={mentionMenuPlacement}
              tone={tone}
            />
            <MentionEditor
              ariaLabel={
                placeholderOverride ?? t("sessions:composer.sendFollowUp")
              }
              initialContent={initialEditorContent}
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
                placeholderOverride ?? t("sessions:composer.sendFollowUp")
              }
              ref={editorRef}
              removeMentionLabel={t("sessions:composer.removeAttachment")}
              sendShortcut={sendShortcut}
              className="px-1"
              editorClassName="min-h-14 max-h-40 overflow-y-auto overscroll-contain"
            />
          </div>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("common:actions.attach")}
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
                      tone === "welcome"
                        ? "text-welcome-fg-muted hover:bg-chat-surface-control hover:text-welcome-fg-secondary"
                        : "text-chat-fg-muted hover:bg-chat-surface-control hover:text-chat-fg",
                    )}
                    type="button"
                  >
                    <Plus className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                {attachMenuContent}
              </DropdownMenu>
              {footerLeading}
              {resolvedControls}
              {isAgentMode ? (
                <ContextWindowIndicator
                  afterModel={footerTrailing}
                  footer={runtimeMenuExtras}
                  isRunning={isRunning}
                  layout="split"
                />
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {!isAgentMode && footerTrailing ? footerTrailing : null}
              {isRunning ? (
                <button
                  aria-label={t("common:actions.stop")}
                  type="button"
                  onClick={onStop}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                    tone === "welcome"
                      ? "bg-chat-surface-control text-welcome-fg-muted hover:bg-chat-surface-control-hover hover:text-welcome-fg-secondary disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-chat-surface-control disabled:hover:text-welcome-fg-muted"
                      : "bg-chat-fg text-chat-canvas shadow-chat-soft hover:bg-chat-fg-secondary disabled:cursor-not-allowed disabled:bg-chat-surface-disabled disabled:text-chat-fg-muted disabled:hover:bg-chat-surface-disabled",
                  )}
                >
                  <span className="flex size-3 items-center justify-center rounded-control bg-current" />
                </button>
              ) : null}
              {!isRunning || canSend ? (
                <button
                  aria-label={t("common:actions.send")}
                  type="submit"
                  disabled={!canSend}
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full transition-colors",
                    tone === "welcome"
                      ? "size-7 bg-chat-surface-control text-welcome-fg-muted hover:bg-chat-surface-control-hover hover:text-welcome-fg-secondary disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-chat-surface-control disabled:hover:text-welcome-fg-muted"
                      : "size-8 bg-chat-fg text-chat-canvas shadow-chat-soft hover:bg-chat-fg-secondary disabled:cursor-not-allowed disabled:bg-chat-surface-disabled disabled:text-chat-fg-muted disabled:hover:bg-chat-surface-disabled",
                  )}
                >
                  <CornerDownLeft className="size-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
