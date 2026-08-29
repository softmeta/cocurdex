import type {
  AgentId,
  AgentPermissionMode,
  AgentProviderSnapshot,
  AgentSessionConfigOption,
  AgentSessionMode,
  AgentSlashCommand,
  AgentThinkingLevel,
  CollaborationModeKind,
  MessageAttachment,
} from "@cocurdex/shared";
import {
  isContextAttachment,
  isDocumentAttachment,
  supportsInSessionRuntimeAxis,
} from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { Paperclip, Plus } from "lucide-react";
import type { ChangeEvent, ClipboardEvent, DragEvent, ReactNode } from "react";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownContent,
  AppDropdownItem,
  AppDropdownTriggerLabel,
  appDropdownSeparatorClassName,
  compactDropdownContentClassName,
} from "@/components";
import { DropdownMenuGroup, DropdownMenuSeparator } from "@/components/ui";
import {
  AgentSelect,
  agentLabels,
  agentsAtom,
  buildAgentSelectOptions,
  CollaborationModeSubmenu,
  supportsPlanMode,
} from "@/features/sessions";
import { cn } from "@/lib";
import { AgentRuntimeConfigControl } from "./agent-runtime-controls";
import { composerFooterControlClassName } from "./chat-composer-layout";
import {
  getContextAttachmentMentionLabel,
  getContextAttachmentSerializedText,
  useContextFileMentions,
} from "./context-file-mentions";
import {
  DOCUMENT_ATTACHMENT_ACCEPT,
  getDocumentAttachmentValidationError,
  importDocumentFiles,
  isSupportedDocumentFile,
  supportsDocumentAttachments,
} from "./document-attachment-files";
import {
  canAddImageAttachments,
  filterSupportedImageFiles,
  getImageAttachmentLimitError,
  getImageAttachmentValidationError,
  importImageFiles,
} from "./image-attachments";
import type {
  MentionAnchor,
  MentionableAttachment,
  MentionEditorChange,
  MentionEditorHandle,
} from "./mention-editor";
import { PanelComposer } from "./panel-composer";
import { PillComposer } from "./pill-composer";
import { sendShortcutAtom } from "./send-shortcut";
import { useSlashCommands } from "./slash-command-menu";
import type { ThinkingLevelOption } from "./thinking-level";
import { ThinkingLevelSubmenu } from "./thinking-level-submenu";

export interface ChatComposerHandle {
  insertContextMention(attachment: MessageAttachment): boolean;
  insertText(text: string): boolean;
}

interface ChatComposerProps {
  attachment?: MessageAttachment;
  agentType?: AgentId;
  agentLabel?: string;
  isRunning?: boolean;
  collaborationMode?: CollaborationModeKind;
  permissionMode?: AgentPermissionMode | null;
  providerSnapshot?: AgentProviderSnapshot | null;
  variant?: "panel" | "pill";
  workspaceRootPath?: string | null;
  mode?: "agent" | "chat";
  tone?: "chat" | "welcome";
  attachMenuExtras?: ReactNode;
  controls?: ReactNode;
  runtimeCommands?: AgentSlashCommand[] | null;
  runtimeConfigOptions?: AgentSessionConfigOption[];
  runtimeMode?: {
    availableModes: AgentSessionMode[];
    currentModeId: string;
  } | null;
  // Left-cluster slot before agent/runtime controls (e.g. workspace name).
  footerLeading?: ReactNode;
  // Right-aligned footer slot for chat mode's context meter, mirroring agent
  // mode's built-in ContextWindowIndicator on the same edge.
  footerTrailing?: ReactNode;
  header?: ReactNode;
  canSubmit?: boolean;
  canSendWhileRunning?: boolean;
  placeholderOverride?: string;
  mentionMenuPlacement?: "top" | "bottom";
  onClearAttachment?(): void;
  onSelectCollaborationMode?(mode: CollaborationModeKind): void;
  onSelectPermissionMode?(mode: AgentPermissionMode): void;
  onSelectAgent?(agentType: AgentId): void;
  onSelectThinkingLevel?(level: AgentThinkingLevel): void;
  onSelectRuntimeMode?(modeId: string): void;
  onSelectRuntimeConfig?(configId: string, value: boolean | string): void;
  onSend(
    message: string,
    attachments: MessageAttachment[],
    useOppositeFollowUpBehavior?: boolean,
  ): void;
  onStop?(): void;
  floatPendingAttachments?: boolean;
  pendingAttachmentHost?: HTMLElement | null;
  thinkingLevel?: AgentThinkingLevel | null;
  thinkingLevelOptions?: ThinkingLevelOption[];
}

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer(
    {
      attachment,
      agentType,
      agentLabel = "Codex",
      isRunning = false,
      collaborationMode = "default",
      variant = "panel",
      workspaceRootPath,
      mode = "agent",
      tone = "chat",
      attachMenuExtras,
      controls,
      runtimeCommands,
      runtimeConfigOptions = [],
      runtimeMode,
      footerLeading,
      footerTrailing,
      header,
      canSubmit,
      canSendWhileRunning = false,
      placeholderOverride,
      mentionMenuPlacement = "top",
      onClearAttachment,
      onSelectCollaborationMode,
      onSelectAgent,
      onSelectThinkingLevel,
      onSelectRuntimeConfig,
      onSelectRuntimeMode,
      onSend,
      onStop,
      floatPendingAttachments = false,
      pendingAttachmentHost = null,
      thinkingLevel = null,
      thinkingLevelOptions = [],
    },
    ref,
  ) {
    const { t } = useTranslation(["common", "sessions"]);
    const sendShortcut = useAtomValue(sendShortcutAtom);
    const agents = useAtomValue(agentsAtom);
    const isAgentMode = mode === "agent";
    const attachmentInputRef = useRef<HTMLInputElement | null>(null);
    const editorRef = useRef<MentionEditorHandle | null>(null);
    const [text, setText] = useState("");
    const [mentions, setMentions] = useState<MentionableAttachment[]>([]);
    const [mentionAnchor, setMentionAnchor] = useState<MentionAnchor | null>(
      null,
    );
    const [attachmentImportError, setAttachmentImportError] = useState<
      string | null
    >(null);
    const [managedAttachments, setManagedAttachments] = useState<
      MessageAttachment[]
    >([]);

    const hasExternalAttachment = Boolean(attachment);
    const composerAttachments: MessageAttachment[] =
      attachment && hasExternalAttachment
        ? [attachment, ...mentions, ...managedAttachments]
        : [...mentions, ...managedAttachments];
    // Context selections added to chat render inline as mentions inside the
    // editor, so only the external attachment (e.g. a file-tree add) needs a
    // chip. Rendering mentions as chips too would duplicate them.
    const contextAttachments: MessageAttachment[] =
      attachment && hasExternalAttachment ? [attachment] : [];

    const contextFileMentions = useContextFileMentions({
      attachments: mentions,
      editorRef,
      workspaceRootPath,
    });

    const slashCommands = useSlashCommands({
      agentType,
      editorRef,
      runtimeCommands,
      workspaceRootPath,
    });

    const insertContextMention = useCallback(
      (ctx: MessageAttachment) => {
        const editor = editorRef.current;
        if (!isContextAttachment(ctx) || !editor) return false;
        editor.insertMention(
          ctx,
          getContextAttachmentMentionLabel(ctx),
          getContextAttachmentSerializedText(ctx, workspaceRootPath),
          { placement: "end" },
        );
        return true;
      },
      [workspaceRootPath],
    );

    useImperativeHandle(
      ref,
      () => ({
        insertContextMention,
        insertText(text) {
          const editor = editorRef.current;
          if (!editor) return false;
          editor.insertText(text);
          return true;
        },
      }),
      [insertContextMention],
    );

    const handleEditorChange = (next: MentionEditorChange) => {
      setText(next.text);
      setMentions(next.mentions);
    };

    const selectedAgent = agentType ?? "pi";
    const canAttachDocuments = supportsDocumentAttachments(selectedAgent);
    const hasUnsupportedDocument =
      !canAttachDocuments && managedAttachments.some(isDocumentAttachment);
    const documentCapabilityError = hasUnsupportedDocument
      ? `${agentLabels[selectedAgent]} does not support PDF attachments.`
      : null;
    const attachmentError = attachmentImportError ?? documentCapabilityError;
    const hasContent = text.trim().length > 0 || composerAttachments.length > 0;
    const externalAllowSend = canSubmit ?? true;
    const canSend = hasContent && externalAllowSend && !hasUnsupportedDocument;
    const canSubmitNow = canSend && (!isRunning || canSendWhileRunning);
    const canSelectAgent = Boolean(onSelectAgent) && !isRunning;

    const handleSelectAgent = (nextAgent: AgentId) => {
      if (!supportsPlanMode(nextAgent) && collaborationMode !== "default") {
        onSelectCollaborationMode?.("default");
      }
      onSelectAgent?.(nextAgent);
    };

    const sendMessage = (useOppositeFollowUpBehavior = false) => {
      if (!canSubmitNow) return;
      onSend(text.trim(), composerAttachments, useOppositeFollowUpBehavior);
      editorRef.current?.clear();
      setText("");
      setMentions([]);
      setManagedAttachments([]);
      setAttachmentImportError(null);
    };

    const addAttachmentFiles = async (files: File[]) => {
      const imageFiles = filterSupportedImageFiles(files);
      const documentFiles = canAttachDocuments
        ? files.filter(isSupportedDocumentFile)
        : [];
      const invalidFile = files.find(
        (file) => !imageFiles.includes(file) && !documentFiles.includes(file),
      );
      if (invalidFile) {
        let message = getImageAttachmentValidationError(invalidFile);
        if (invalidFile.type === DOCUMENT_ATTACHMENT_ACCEPT) {
          message = `${agentLabels[selectedAgent]} does not support PDF attachments.`;
        } else if (canAttachDocuments) {
          message = "Only PNG, JPEG, GIF, WebP, or PDF files are supported.";
        }
        setAttachmentImportError(message);
        return;
      }
      const invalidImage = imageFiles.find(getImageAttachmentValidationError);
      if (invalidImage) {
        setAttachmentImportError(
          getImageAttachmentValidationError(invalidImage),
        );
        return;
      }
      const invalidDocument = documentFiles.find(
        getDocumentAttachmentValidationError,
      );
      if (invalidDocument) {
        setAttachmentImportError(
          getDocumentAttachmentValidationError(invalidDocument),
        );
        return;
      }
      if (!canAddImageAttachments(composerAttachments, imageFiles.length)) {
        setAttachmentImportError(getImageAttachmentLimitError());
        return;
      }
      try {
        const [importedImages, importedDocuments] = await Promise.all([
          importImageFiles(imageFiles),
          importDocumentFiles(documentFiles),
        ]);
        setManagedAttachments((current) => [
          ...current,
          ...importedImages,
          ...importedDocuments,
        ]);
        setAttachmentImportError(null);
      } catch (error) {
        setAttachmentImportError(
          error instanceof Error ? error.message : "Failed to import file.",
        );
      }
    };

    const openAttachmentPicker = () => attachmentInputRef.current?.click();

    const handleAttachmentInputChange = (
      event: ChangeEvent<HTMLInputElement>,
    ) => {
      void addAttachmentFiles(Array.from(event.target.files ?? []));
      event.target.value = "";
    };

    const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
      const files = Array.from(event.clipboardData.files);
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) return;
      event.preventDefault();
      void addAttachmentFiles(imageFiles);
    };

    const handleDragOver = (event: DragEvent<HTMLFormElement>) => {
      const hasFiles = Array.from(event.dataTransfer.items).some(
        (item) => item.kind === "file",
      );
      if (hasFiles) event.preventDefault();
    };

    const handleDrop = (event: DragEvent<HTMLFormElement>) => {
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;
      event.preventDefault();
      void addAttachmentFiles(files);
    };

    const removeAttachment = (index: number) => {
      if (hasExternalAttachment && index === 0) {
        onClearAttachment?.();
        return;
      }
      const offset = (hasExternalAttachment ? 1 : 0) + mentions.length;
      const managedIndex = index - offset;
      if (managedIndex < 0) return;
      setManagedAttachments((current) =>
        current.filter((_, i) => i !== managedIndex),
      );
    };

    let agentChevronClassName: string | undefined;
    if (!canSelectAgent) {
      agentChevronClassName = "hidden";
    } else if (variant === "pill") {
      agentChevronClassName = "max-[520px]:hidden";
    }

    const agentMenu = (
      <AgentSelect
        appearance={variant === "pill" ? "ghost" : "outline"}
        chevronClassName={agentChevronClassName}
        disabled={!canSelectAgent}
        options={buildAgentSelectOptions(agents)}
        triggerAriaLabel={t("sessions:composer.selectAgent")}
        triggerClassName={cn(
          "max-w-45",
          variant === "pill" &&
            composerFooterControlClassName(
              "max-[520px]:w-8 max-[520px]:justify-center",
            ),
        )}
        triggerLabel={
          <>
            {variant === "panel" ? (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-muted-foreground">
                <Plus className="size-4" />
              </span>
            ) : null}
            <AppDropdownTriggerLabel
              className={cn(
                variant === "pill" ? "max-[520px]:sr-only" : "font-medium",
              )}
            >
              {agentLabel}
            </AppDropdownTriggerLabel>
          </>
        }
        value={selectedAgent}
        onValueChange={handleSelectAgent}
      />
    );

    // Collaboration and thinking are runtime axes, so they live beside model
    // and permission instead of inside the add-attachment menu.
    const runtimeMenuExtras = isAgentMode ? (
      <>
        <CollaborationModeSubmenu
          agentType={selectedAgent}
          mode={collaborationMode}
          runtimeMode={runtimeMode}
          runtimeModeDisabled={isRunning}
          onChange={onSelectCollaborationMode}
          onRuntimeModeChange={onSelectRuntimeMode}
        />
        {supportsInSessionRuntimeAxis(selectedAgent, "thinking") &&
        thinkingLevelOptions.length > 1 ? (
          <ThinkingLevelSubmenu
            level={thinkingLevel}
            options={thinkingLevelOptions}
            onChange={onSelectThinkingLevel}
          />
        ) : null}
      </>
    ) : null;

    const defaultAgentControls = isAgentMode ? (
      <>
        {agentMenu}
        <AgentRuntimeConfigControl
          configOptions={runtimeConfigOptions}
          disabled={isRunning}
          onChange={onSelectRuntimeConfig}
        />
      </>
    ) : null;
    const resolvedControls = controls ?? defaultAgentControls;

    const attachMenuContent = (
      <AppDropdownContent
        className={cn(
          compactDropdownContentClassName,
          "**:[[role=menuitem]]:text-body",
        )}
        side="bottom"
      >
        <DropdownMenuGroup>
          <AppDropdownItem onClick={openAttachmentPicker}>
            <Paperclip className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {t("common:actions.attach")}
            </span>
          </AppDropdownItem>
        </DropdownMenuGroup>
        {attachMenuExtras ? (
          <>
            <DropdownMenuSeparator className={appDropdownSeparatorClassName} />
            {attachMenuExtras}
          </>
        ) : null}
      </AppDropdownContent>
    );

    return (
      <form
        className="relative flex flex-col gap-3 @container/composer"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage();
        }}
      >
        <input
          accept={
            canAttachDocuments
              ? `image/png,image/jpeg,image/gif,image/webp,${DOCUMENT_ATTACHMENT_ACCEPT}`
              : "image/png,image/jpeg,image/gif,image/webp"
          }
          className="hidden"
          multiple
          onChange={handleAttachmentInputChange}
          ref={attachmentInputRef}
          type="file"
        />
        {variant === "pill" ? (
          <PillComposer
            attachMenuContent={attachMenuContent}
            canSend={canSubmitNow}
            composerAttachments={composerAttachments}
            contextAttachments={contextAttachments}
            contextFileMentions={contextFileMentions}
            editorRef={editorRef}
            footerLeading={footerLeading}
            footerTrailing={footerTrailing}
            runtimeMenuExtras={runtimeMenuExtras}
            attachmentError={attachmentError}
            isAgentMode={isAgentMode}
            isRunning={isRunning}
            mentionAnchor={mentionAnchor}
            mentions={mentions}
            onEditorChange={handleEditorChange}
            onMentionAnchorChange={setMentionAnchor}
            onPaste={handlePaste}
            onRemoveAttachment={removeAttachment}
            onStop={onStop}
            onSubmit={sendMessage}
            floatPendingAttachments={floatPendingAttachments}
            pendingAttachmentHost={pendingAttachmentHost}
            placeholderOverride={placeholderOverride}
            resolvedControls={resolvedControls}
            slashCommands={slashCommands}
            sendShortcut={sendShortcut}
            text={text}
          />
        ) : (
          <PanelComposer
            attachMenuContent={attachMenuContent}
            canSend={canSubmitNow}
            composerAttachments={composerAttachments}
            contextAttachments={contextAttachments}
            contextFileMentions={contextFileMentions}
            editorRef={editorRef}
            footerLeading={footerLeading}
            footerTrailing={footerTrailing}
            runtimeMenuExtras={runtimeMenuExtras}
            header={header}
            attachmentError={attachmentError}
            isAgentMode={isAgentMode}
            isRunning={isRunning}
            mentionAnchor={mentionAnchor}
            mentionMenuPlacement={mentionMenuPlacement}
            onEditorChange={handleEditorChange}
            onMentionAnchorChange={setMentionAnchor}
            onPaste={handlePaste}
            onRemoveAttachment={removeAttachment}
            onStop={onStop}
            onSubmit={sendMessage}
            placeholderOverride={placeholderOverride}
            resolvedControls={resolvedControls}
            slashCommands={slashCommands}
            sendShortcut={sendShortcut}
            tone={tone}
          />
        )}
      </form>
    );
  },
);
