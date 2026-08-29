import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn, useDocumentEvent } from "@/lib";
import {
  appendMentionAtEnd,
  getMentionRegistryKey,
  MENTION_KEY_ATTR,
  type MentionAnchor,
  type MentionableAttachment,
  pillElementFromAttachment,
  placeCaretAtEnd,
  readMentionStateFromSelection,
  replaceMentionTokenWithPill,
  replaceSlashTokenWithText,
  serializeEditor,
} from "./mention-editor-dom";

export type { MentionAnchor, MentionableAttachment };
export { getMentionRegistryKey };

import { getComposerEnterAction, type SendShortcut } from "./send-shortcut";

export type MentionEditorChange = {
  text: string;
  mentions: MentionableAttachment[];
};

export type MentionEditorHandle = {
  blur(): void;
  clear(): void;
  focus(): void;
  insertMention(
    attachment: MentionableAttachment,
    displayLabel: string,
    serializedText: string,
    options?: { placement?: "selection" | "end" },
  ): void;
  insertText(text: string): void;
  replaceSlashToken(text: string): boolean;
};

export interface MentionEditorProps {
  ariaLabel?: string;
  autoFocus?: boolean;
  className?: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean;
  onChange(value: MentionEditorChange): void;
  onKeyDown?(event: React.KeyboardEvent<HTMLDivElement>): void;
  onMentionQueryChange(query: string | null): void;
  onSlashQueryChange?(query: string | null): void;
  onMentionAnchorChange?(anchor: MentionAnchor | null): void;
  onPaste?(event: React.ClipboardEvent<HTMLDivElement>): void;
  onSubmit(useOppositeFollowUpBehavior?: boolean): void;
  placeholder?: string;
  removeMentionLabel: string;
  sendShortcut?: SendShortcut;
}

export const MentionEditor = forwardRef<
  MentionEditorHandle,
  MentionEditorProps
>(function MentionEditor(
  {
    ariaLabel,
    autoFocus,
    className,
    containerRef,
    disabled,
    onChange,
    onKeyDown,
    onMentionQueryChange,
    onSlashQueryChange,
    onMentionAnchorChange,
    onPaste,
    onSubmit,
    placeholder,
    removeMentionLabel,
    sendShortcut = "enter",
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const localContainerRef = useRef<HTMLDivElement | null>(null);
  const resolvedContainerRef = containerRef ?? localContainerRef;
  const registryRef = useRef<Map<string, MentionableAttachment>>(new Map());
  const isComposingRef = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const { text, mentionKeys } = serializeEditor(editor);
    const mentions: MentionableAttachment[] = [];
    const seen = new Set<string>();
    for (const key of mentionKeys) {
      if (seen.has(key)) continue;
      seen.add(key);
      const attachment = registryRef.current.get(key);
      if (attachment) mentions.push(attachment);
    }

    setIsEmpty(text.length === 0 && mentionKeys.length === 0);
    onChange({ text, mentions });
  }, [onChange]);

  const emitMentionQuery = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      onMentionQueryChange(null);
      onMentionAnchorChange?.(null);
      return;
    }

    const state = readMentionStateFromSelection(editor);
    onMentionQueryChange(state?.trigger === "mention" ? state.query : null);
    onSlashQueryChange?.(state?.trigger === "slash" ? state.query : null);
    onMentionAnchorChange?.(state?.anchor ?? null);
  }, [onMentionQueryChange, onSlashQueryChange, onMentionAnchorChange]);

  useImperativeHandle(
    ref,
    () => ({
      blur() {
        editorRef.current?.blur();
      },
      clear() {
        const editor = editorRef.current;
        if (!editor) return;
        editor.innerHTML = "";
        registryRef.current.clear();
        setIsEmpty(true);
        onChange({ text: "", mentions: [] });
        onMentionQueryChange(null);
        onSlashQueryChange?.(null);
        onMentionAnchorChange?.(null);
      },
      focus() {
        editorRef.current?.focus();
      },
      insertMention(attachment, displayLabel, serializedText, options) {
        const editor = editorRef.current;
        if (!editor) return;
        const key = getMentionRegistryKey(attachment);
        registryRef.current.set(key, attachment);
        const pill = pillElementFromAttachment(
          attachment,
          displayLabel,
          serializedText,
          removeMentionLabel,
        );
        editor.focus();
        const inserted =
          options?.placement === "end"
            ? false
            : replaceMentionTokenWithPill(editor, pill);
        if (!inserted) {
          const selection = document.getSelection();
          if (
            options?.placement !== "end" &&
            selection &&
            selection.rangeCount > 0 &&
            editor.contains(selection.getRangeAt(0).startContainer)
          ) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(pill);
            const space = document.createTextNode(" ");
            if (pill.nextSibling) {
              pill.parentNode?.insertBefore(space, pill.nextSibling);
            } else {
              pill.parentNode?.appendChild(space);
            }
            const newRange = document.createRange();
            newRange.setStart(space, 1);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          } else {
            appendMentionAtEnd(editor, pill);
          }
        }
        emitChange();
        onMentionQueryChange(null);
        onSlashQueryChange?.(null);
        onMentionAnchorChange?.(null);
      },
      insertText(text) {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus();
        const textNode = document.createTextNode(text);
        const selection = document.getSelection();
        if (
          selection &&
          selection.rangeCount > 0 &&
          editor.contains(selection.getRangeAt(0).startContainer)
        ) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(textNode);
          const newRange = document.createRange();
          newRange.setStartAfter(textNode);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        } else {
          editor.appendChild(textNode);
          placeCaretAtEnd(editor);
        }
        emitChange();
      },
      replaceSlashToken(text) {
        const editor = editorRef.current;
        if (!editor) return false;
        editor.focus();
        const replaced = replaceSlashTokenWithText(editor, text);
        if (!replaced) return false;
        emitChange();
        onSlashQueryChange?.(null);
        onMentionAnchorChange?.(null);
        return true;
      },
    }),
    [
      emitChange,
      onChange,
      onMentionQueryChange,
      onSlashQueryChange,
      onMentionAnchorChange,
      removeMentionLabel,
    ],
  );

  const handleSelectionChange = useCallback(() => {
    if (document.activeElement !== editorRef.current) return;
    emitMentionQuery();
  }, [emitMentionQuery]);
  useDocumentEvent("selectionchange", handleSelectionChange);

  // Callback ref doubles as the autoFocus seam: it fires when the node attaches
  // (focusing on mount) and re-fires if autoFocus flips, since its identity
  // then changes — matching the old effect without a separate useEffect.
  const setEditorNode = useCallback(
    (node: HTMLDivElement | null) => {
      editorRef.current = node;
      if (node && autoFocus) node.focus();
    },
    [autoFocus],
  );

  const handleInput = () => {
    if (isComposingRef.current) return;
    emitChange();
    emitMentionQuery();
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
    setIsEmpty(false);
  };

  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    emitChange();
    emitMentionQuery();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    onPaste?.(event);
    if (event.defaultPrevented) return;

    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;

    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    const newRange = document.createRange();
    newRange.setStart(node, node.length);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);
    emitChange();
    emitMentionQuery();
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const removeButton = target.closest(
      "[data-remove-mention]",
    ) as HTMLElement | null;
    if (!removeButton) return;
    const pill = removeButton.closest(`[${MENTION_KEY_ATTR}]`);
    if (!pill || !editorRef.current?.contains(pill)) return;
    event.preventDefault();
    pill.remove();
    emitChange();
    editorRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isComposingRef.current) return;

    if (event.key === "Enter") {
      if (!event.shiftKey) {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
      }

      const action = getComposerEnterAction({
        shortcut: sendShortcut,
        hasPrimaryModifier: event.metaKey || event.ctrlKey,
        hasShiftModifier: event.shiftKey,
        isMultiline: editorRef.current?.innerText.includes("\n") ?? false,
      });
      if (action.type === "newline") return;

      event.preventDefault();
      onSubmit(action.useOppositeFollowUpBehavior);
      return;
    }

    onKeyDown?.(event);
  };

  return (
    <div
      ref={resolvedContainerRef}
      className={cn("relative min-w-0", className)}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a contenteditable rich-text editor with inline mention pills cannot be a native input/textarea */}
      <div
        ref={setEditorNode}
        aria-label={ariaLabel}
        className={cn(
          "mention-editor relative min-w-0 whitespace-pre-wrap wrap-break-word outline-none text-body text-chat-fg before:pointer-events-none before:absolute before:inset-0 before:text-chat-fg-muted/55 data-empty:before:content-[attr(data-placeholder)]",
          disabled && "pointer-events-none opacity-60",
        )}
        aria-placeholder={placeholder}
        contentEditable={!disabled}
        data-empty={isEmpty || undefined}
        data-placeholder={placeholder}
        {...({ placeholder } as Record<string, unknown>)}
        onClick={handleClick}
        onCompositionEnd={handleCompositionEnd}
        onCompositionStart={handleCompositionStart}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        role="textbox"
        tabIndex={disabled ? -1 : 0}
        spellCheck
        suppressContentEditableWarning
      />
    </div>
  );
});
