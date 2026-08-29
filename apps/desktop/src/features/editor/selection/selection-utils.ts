import type { ContextFileAttachment } from "@cocurdex/shared";
import type { editor as MonacoEditorNamespace } from "monaco-editor";
import { getEditorLanguage } from "../monaco/monaco-utils";

const SELECTION_CONTEXT_PADDING = 2;
const MIN_SELECTION_ACTIONABLE_CHARS = 2;

export const SELECTION_BUBBLE_DELAY_MS = 180;
// Approximate bubble width reserved when clamping the popup inside the editor
// bounds. The button itself is auto-sized; this only keeps it off the edge.
export const SELECTION_BUBBLE_WIDTH = 168;

export type SelectionBubbleState = {
  attachment: ContextFileAttachment;
  left: number;
  selectionKey: string;
  top: number;
};

export type PointerPosition = {
  clientX: number;
  clientY: number;
};

function getSurroundingContext(
  model: MonacoEditorNamespace.ITextModel,
  startLine: number,
  endLine: number,
) {
  const contextStartLine = Math.max(1, startLine - SELECTION_CONTEXT_PADDING);
  const contextEndLine = Math.min(
    model.getLineCount(),
    endLine + SELECTION_CONTEXT_PADDING,
  );

  return model.getValueInRange({
    startColumn: 1,
    startLineNumber: contextStartLine,
    endColumn: model.getLineMaxColumn(contextEndLine),
    endLineNumber: contextEndLine,
  });
}

function isSelectionActionable(
  selectedText: string,
  startLine: number,
  endLine: number,
) {
  if (startLine !== endLine) {
    return true;
  }

  return (
    [...selectedText.replace(/\s+/g, "")].length >=
    MIN_SELECTION_ACTIONABLE_CHARS
  );
}

export function getSelectionAttachment(
  editor: MonacoEditorNamespace.IStandaloneCodeEditor,
  filePath: string,
): ContextFileAttachment | null {
  const model = editor.getModel();
  const selection = editor.getSelection();

  if (!model || !selection || selection.isEmpty()) {
    return null;
  }

  const selectedText = model.getValueInRange(selection);

  if (selectedText.trim().length === 0) {
    return null;
  }

  const startLine = selection.startLineNumber;
  const endLine = selection.endLineNumber;
  const startColumn = selection.startColumn;
  const endColumn = selection.endColumn;

  if (!isSelectionActionable(selectedText, startLine, endLine)) {
    return null;
  }

  // Whole-line selections (line head to line tail) carry no useful column
  // detail, so drop the columns and let the label render as `L19-19`. Partial
  // spans keep their columns for `L19:5-19:20`.
  const isWholeLineSpan =
    startColumn === 1 && endColumn === model.getLineMaxColumn(endLine);

  return {
    filePath,
    language: getEditorLanguage(filePath),
    selectedText,
    startLine,
    startColumn: isWholeLineSpan ? undefined : startColumn,
    endLine,
    endColumn: isWholeLineSpan ? undefined : endColumn,
    surroundingContext: getSurroundingContext(model, startLine, endLine),
  };
}

export function getSelectionBubbleState(
  editor: MonacoEditorNamespace.IStandaloneCodeEditor,
  attachment: ContextFileAttachment,
  pointerPosition?: PointerPosition | null,
) {
  const selection = editor.getSelection();
  const editorDomNode = editor.getDomNode();

  if (!selection || !editorDomNode) {
    return null;
  }

  const visiblePosition = editor.getScrolledVisiblePosition(
    selection.getEndPosition(),
  );

  if (!visiblePosition) {
    return null;
  }

  const editorBounds = editorDomNode.getBoundingClientRect();
  const maxLeft = Math.max(
    16,
    editorDomNode.clientWidth - SELECTION_BUBBLE_WIDTH - 16,
  );
  const preferredLeft = pointerPosition
    ? pointerPosition.clientX - editorBounds.left + 12
    : visiblePosition.left + 12;
  const preferredTop = pointerPosition
    ? pointerPosition.clientY - editorBounds.top + 16
    : visiblePosition.top + visiblePosition.height + 10;

  return {
    attachment,
    left: Math.min(maxLeft, Math.max(16, preferredLeft)),
    selectionKey: getSelectionKey(attachment),
    top: Math.max(12, preferredTop),
  } satisfies SelectionBubbleState;
}

export function getSelectionKey(attachment: ContextFileAttachment) {
  return [
    attachment.filePath,
    attachment.startLine,
    attachment.endLine,
    attachment.selectedText,
  ].join(":");
}
