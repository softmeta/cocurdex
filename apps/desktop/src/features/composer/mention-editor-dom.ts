import type { ContextFileAttachment } from "@cocurdex/shared";
import {
  type ContextFolderAttachment,
  isContextFolderAttachment,
} from "@cocurdex/shared";
import { renderFileTypeIconHtml } from "@/components";
import { cn } from "@/lib";

// Mention identity/types live in this leaf module so the editor component can
// depend on the DOM helpers without a cycle.
export type MentionableAttachment =
  | ContextFileAttachment
  | ContextFolderAttachment;

export interface MentionAnchor {
  left: number;
  top: number;
  bottom: number;
}

export function getMentionRegistryKey(attachment: MentionableAttachment) {
  if (isContextFolderAttachment(attachment)) {
    return `folder:${attachment.folderPath}`;
  }
  return `file:${attachment.filePath}:${attachment.startLine}:${attachment.endLine}`;
}

export const MENTION_KEY_ATTR = "data-mention-key";
export const MENTION_DISPLAY_ATTR = "data-mention-display";

// Cursor-style mention: coloured text, no background / border. Uses
// `inline-flex` so the icon / × / label children stay on one row.
// `leading-none` keeps the pill box exactly one em tall so `align-middle` lands
// it inside the surrounding line box — with the inherited line-height the box
// was taller than the text and grew the composer by a line on every mention.
const MENTION_PILL_CLASSNAME = cn(
  "mention-pill group inline-flex items-center gap-1 align-middle leading-none text-chat-link transition-colors hover:text-chat-link-hover",
);
const MENTION_SLOT_CLASSNAME =
  "inline-flex h-[1em] w-[1em] items-center justify-center";
const MENTION_ICON_CLASSNAME = cn(MENTION_SLOT_CLASSNAME, "group-hover:hidden");
const MENTION_REMOVE_CLASSNAME = cn(
  "mention-pill-remove",
  MENTION_SLOT_CLASSNAME,
  "hidden cursor-pointer select-none leading-none",
  "text-chat-fg-muted hover:text-chat-fg",
  "group-hover:inline-flex",
);

export function pillElementFromAttachment(
  attachment: MentionableAttachment,
  displayLabel: string,
  serializedText: string,
  removeLabel: string,
) {
  const span = document.createElement("span");
  span.setAttribute("contenteditable", "false");
  span.setAttribute(MENTION_KEY_ATTR, getMentionRegistryKey(attachment));
  span.setAttribute(MENTION_DISPLAY_ATTR, displayLabel);
  span.dataset.mentionText = serializedText;
  span.className = MENTION_PILL_CLASSNAME;
  span.contentEditable = "false";

  const path = isContextFolderAttachment(attachment)
    ? attachment.folderPath
    : (attachment as Exclude<MentionableAttachment, ContextFolderAttachment>)
        .filePath;
  const iconHtml = renderFileTypeIconHtml(path, {
    isFolder: isContextFolderAttachment(attachment),
  });
  if (iconHtml) {
    const icon = document.createElement("span");
    icon.className = MENTION_ICON_CLASSNAME;
    icon.innerHTML = iconHtml;
    span.appendChild(icon);
  }

  const remove = document.createElement("span");
  remove.setAttribute("role", "button");
  remove.setAttribute("aria-label", removeLabel);
  remove.dataset.removeMention = "true";
  remove.className = MENTION_REMOVE_CLASSNAME;
  remove.textContent = "×";
  span.appendChild(remove);

  const label = document.createElement("span");
  label.textContent = displayLabel;
  span.appendChild(label);

  return span;
}

export type EditorContentNode =
  | { type: "text"; value: string }
  | {
      type: "mention";
      key: string;
      displayLabel: string;
      serializedText: string;
    };

export function serializeEditorContent(editor: HTMLElement) {
  const nodes: EditorContentNode[] = [];
  let textBuffer = "";
  let emittedText = "";

  const appendText = (value: string) => {
    textBuffer += value;
    emittedText += value;
  };

  const flushText = () => {
    if (textBuffer.length === 0) return;
    nodes.push({ type: "text", value: textBuffer });
    textBuffer = "";
  };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "");
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;

    if (element.hasAttribute(MENTION_KEY_ATTR)) {
      const key = element.getAttribute(MENTION_KEY_ATTR);
      if (key) {
        flushText();
        const serializedText = element.dataset.mentionText ?? "";
        nodes.push({
          displayLabel: element.getAttribute(MENTION_DISPLAY_ATTR) ?? "",
          key,
          serializedText,
          type: "mention",
        });
        emittedText += serializedText;
      }
      return;
    }

    if (element.tagName === "BR") {
      appendText("\n");
      return;
    }

    const display = window.getComputedStyle(element).display;
    const isBlock = display === "block" || display === "flex";
    if (isBlock && emittedText.length > 0 && !emittedText.endsWith("\n")) {
      appendText("\n");
    }

    for (const child of Array.from(element.childNodes)) {
      visit(child);
    }
  };

  for (const child of Array.from(editor.childNodes)) {
    visit(child);
  }

  flushText();
  return nodes;
}

export function serializeEditor(editor: HTMLElement) {
  const nodes = serializeEditorContent(editor);
  let text = "";
  const mentionKeys: string[] = [];

  for (const node of nodes) {
    if (node.type === "text") {
      text += node.value;
      continue;
    }
    mentionKeys.push(node.key);
    text += node.serializedText;
  }

  return { mentionKeys, nodes, text };
}

export function hydrateEditorContent(
  editor: HTMLElement,
  nodes: EditorContentNode[],
  mentions: MentionableAttachment[],
  removeMentionLabel: string,
) {
  const mentionsByKey = new Map(
    mentions.map((mention) => [getMentionRegistryKey(mention), mention]),
  );
  editor.replaceChildren();
  const restored: MentionableAttachment[] = [];

  for (const node of nodes) {
    if (node.type === "text") {
      if (node.value.length > 0) {
        editor.appendChild(document.createTextNode(node.value));
      }
      continue;
    }
    const attachment = mentionsByKey.get(node.key);
    if (!attachment) continue;
    editor.appendChild(
      pillElementFromAttachment(
        attachment,
        node.displayLabel,
        node.serializedText,
        removeMentionLabel,
      ),
    );
    restored.push(attachment);
  }

  return restored;
}

interface MentionSelectionState {
  trigger: "mention" | "slash";
  query: string;
  anchor: MentionAnchor | null;
}

// Anchors carry viewport coordinates: the menus render in a body portal and are
// fixed-positioned, so they float over the whole window (Cursor-style) instead
// of being confined to the composer panel's box.
function measureGlyphAnchor(
  editor: HTMLElement,
  node: Node,
  offset: number,
): MentionAnchor {
  const editorRect = editor.getBoundingClientRect();
  // Fall back to the editor's leading edge whenever the glyph has no box yet
  // (empty text node, editor not laid out) — the menu still needs a position.
  const fallback = {
    left: editorRect.left,
    top: editorRect.top,
    bottom: editorRect.bottom,
  };
  const glyphRange = document.createRange();
  try {
    glyphRange.setStart(node, offset);
    glyphRange.setEnd(node, offset + 1);
    if (typeof glyphRange.getBoundingClientRect !== "function") return fallback;
    const rect = glyphRange.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return fallback;
    return { left: rect.left, top: rect.top, bottom: rect.bottom };
  } catch {
    return fallback;
  }
}

export function readMentionStateFromSelection(
  editor: HTMLElement,
): MentionSelectionState | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!range.collapsed) return null;
  if (!editor.contains(range.startContainer)) return null;
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;

  const text = range.startContainer.textContent ?? "";
  const before = text.slice(0, range.startOffset);
  const mentionMatch = before.match(/(^|\s)@(\S*)$/);
  if (mentionMatch?.index !== undefined) {
    const atIndex = mentionMatch.index + (mentionMatch[1]?.length ?? 0);
    const anchor = measureGlyphAnchor(editor, range.startContainer, atIndex);
    return { trigger: "mention", query: mentionMatch[2] ?? "", anchor };
  }

  const slashMatch = before.match(/(^|\s)\/([^\s]*)$/);
  if (slashMatch?.index !== undefined) {
    const slashIndex = slashMatch.index + (slashMatch[1]?.length ?? 0);
    const anchor = measureGlyphAnchor(editor, range.startContainer, slashIndex);
    return { trigger: "slash", query: slashMatch[2] ?? "", anchor };
  }

  return null;
}

export function replaceSlashTokenWithText(
  editor: HTMLElement,
  replacement: string,
): boolean {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return false;

  const textNode = range.startContainer as Text;
  const offset = range.startOffset;
  const text = textNode.textContent ?? "";
  const before = text.slice(0, offset);
  const match = before.match(/(^|\s)\/([^\s]*)$/);
  if (!match) return false;

  const tokenLength = (match[2]?.length ?? 0) + 1;
  const tokenStart = offset - tokenLength;
  textNode.textContent =
    before.slice(0, tokenStart) + replacement + text.slice(offset);

  const newRange = document.createRange();
  newRange.setStart(textNode, tokenStart + replacement.length);
  newRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(newRange);
  return true;
}

export function placeCaretAtEnd(editor: HTMLElement) {
  const selection = document.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

// True when the editor holds no real content — only whitespace and/or the
// stray `<br>`/empty block the browser injects into a focused-but-empty
// contenteditable. Mention pills count as content (they carry MENTION_KEY_ATTR).
function isEditorEmpty(editor: HTMLElement): boolean {
  if (editor.querySelector(`[${MENTION_KEY_ATTR}]`)) return false;
  return (editor.textContent ?? "").trim() === "";
}

export function appendMentionAtEnd(editor: HTMLElement, pill: HTMLElement) {
  // Drop the browser-injected `<br>`/empty block so the first mention lands on
  // the first line instead of after a blank leading line.
  if (isEditorEmpty(editor)) {
    editor.replaceChildren();
  }
  editor.appendChild(pill);
  editor.appendChild(document.createTextNode(" "));
  placeCaretAtEnd(editor);
}

export function replaceMentionTokenWithPill(
  editor: HTMLElement,
  pill: HTMLElement,
): boolean {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return false;

  const textNode = range.startContainer as Text;
  const offset = range.startOffset;
  const before = textNode.textContent ?? "";
  const match = before.slice(0, offset).match(/(^|\s)@(\S*)$/);
  if (!match) return false;

  const tokenLength = (match[2]?.length ?? 0) + 1;
  const tokenStart = offset - tokenLength;
  const after = before.slice(offset);

  textNode.textContent = before.slice(0, tokenStart);

  const parent = textNode.parentNode;
  if (!parent) return false;

  const trailingSpace = document.createTextNode(after.length === 0 ? " " : "");
  const afterNode = after.length === 0 ? null : document.createTextNode(after);

  if (textNode.nextSibling) {
    parent.insertBefore(pill, textNode.nextSibling);
  } else {
    parent.appendChild(pill);
  }

  if (afterNode) {
    parent.insertBefore(afterNode, pill.nextSibling);
  } else {
    parent.insertBefore(trailingSpace, pill.nextSibling);
  }

  if (textNode.textContent === "") {
    parent.removeChild(textNode);
  }

  const newRange = document.createRange();
  const anchor = afterNode ?? trailingSpace;
  newRange.setStart(anchor, anchor === trailingSpace ? 1 : 0);
  newRange.collapse(true);
  const selectionAfter = document.getSelection();
  if (selectionAfter) {
    selectionAfter.removeAllRanges();
    selectionAfter.addRange(newRange);
  }

  return true;
}
