import type { ContextFileAttachment } from "@cocurdex/shared";
import { getEditorLanguage } from "./monaco/monaco-utils";

// Whole-file context (@mention or Add to Chat) is a path for the agent to
// Read. File bytes stay out of the prompt; editor/PDF selections still inline.
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
