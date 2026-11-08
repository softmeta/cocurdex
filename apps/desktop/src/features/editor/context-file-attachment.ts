import type { ContextFileAttachment } from "@cocurdex/shared";
import { getEditorLanguage } from "./monaco/monaco-utils";

export function buildContextFileAttachment(
  filePath: string,
): ContextFileAttachment {
  return {
    contentOmitted: true,
    endLine: 1,
    filePath,
    language: getEditorLanguage(filePath),
    selectedText: "",
    startLine: 1,
    surroundingContext: "",
  };
}
