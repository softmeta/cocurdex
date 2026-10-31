import type { AgentToolCallContent } from "./contracts";
import { countChangedLines } from "./workspace-change-diff";

export interface GetToolCallResultInput {
  toolCallId: string;
}

export function isToolCallId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    /^[^\p{Cc}]+$/u.test(value.replaceAll("\n", " "))
  );
}

export function summarizeToolCallDiff(
  item: Extract<AgentToolCallContent, { type: "diff" }>,
): Extract<AgentToolCallContent, { type: "diff" }> {
  if (item.newText === undefined) {
    return item;
  }
  return {
    type: "diff",
    path: item.path,
    ...countChangedLines(item.oldText ?? "", item.newText),
  };
}

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractTextContent(data: unknown) {
  const dataRecord = asObjectRecord(data);
  if (!Array.isArray(dataRecord?.content)) {
    return null;
  }

  const textBlocks = dataRecord.content.flatMap((block) => {
    const blockRecord = asObjectRecord(block);
    return blockRecord?.type === "text" && typeof blockRecord.text === "string"
      ? [blockRecord.text]
      : [];
  });

  return textBlocks.length > 0 ? textBlocks.join("") : null;
}

export function toolCallResourceLinkPath(value: unknown) {
  const record = asObjectRecord(value);
  if (record?.type !== "resource_link" || typeof record.uri !== "string") {
    return null;
  }
  if (!record.uri.startsWith("file://")) {
    return null;
  }

  try {
    const pathname = decodeURIComponent(new URL(record.uri).pathname);
    return /^\/[A-Za-z]:/.test(pathname) ? pathname.slice(1) : pathname;
  } catch {
    return null;
  }
}

export function formatToolCallData(data: unknown) {
  if (data === undefined || data === null) {
    return null;
  }

  if (typeof data === "string") {
    return data;
  }

  const textContent = extractTextContent(data);
  if (textContent !== null) {
    return textContent;
  }

  return JSON.stringify(data, null, 2);
}

export function formatToolCallOutput(
  content: AgentToolCallContent[] | undefined,
  rawOutput: unknown,
) {
  const text = content?.flatMap((item) => {
    if (item.type === "text") {
      return [item.text];
    }

    if (item.type === "diff") {
      const { additions, deletions } = summarizeToolCallDiff(item);
      return [`${item.path} +${additions ?? 0} -${deletions ?? 0}`];
    }

    if (item.type === "data") {
      if (toolCallResourceLinkPath(item.value)) {
        return [];
      }
      const formatted = formatToolCallData(item.value);
      return formatted ? [formatted] : [];
    }

    return [];
  });

  return text?.join("\n") || formatToolCallData(rawOutput);
}
