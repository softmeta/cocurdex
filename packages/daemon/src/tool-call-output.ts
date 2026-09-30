import type {
  AgentToolCallContent,
  AgentToolCallRecord,
} from "@cocurdex/shared";

export const TOOL_OUTPUT_EDGE_CHARS = 32_000;

function capText(text: string) {
  const omitted = text.length - TOOL_OUTPUT_EDGE_CHARS * 2;
  if (omitted <= 0) {
    return text;
  }

  const head = text.slice(0, TOOL_OUTPUT_EDGE_CHARS);
  const tail = text.slice(-TOOL_OUTPUT_EDGE_CHARS);
  return `${head}\n\n… [${omitted} characters truncated] …\n\n${tail}`;
}

function capValue(value: unknown): unknown {
  if (typeof value === "string") {
    return capText(value);
  }
  if (Array.isArray(value)) {
    return value.map(capValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, capValue(entry)]),
    );
  }
  return value;
}

function capContentItem(item: AgentToolCallContent): AgentToolCallContent {
  if (item.type === "text") {
    return { ...item, text: capText(item.text) };
  }
  if (item.type === "data") {
    return { ...item, value: capValue(item.value) };
  }
  return item;
}

export function capToolCallOutput(
  toolCall: AgentToolCallRecord,
): AgentToolCallRecord {
  return {
    ...toolCall,
    content: toolCall.content?.map(capContentItem),
    rawOutput: capValue(toolCall.rawOutput),
  };
}

export function withoutToolCallOutput(
  toolCall: AgentToolCallRecord,
): AgentToolCallRecord {
  const { rawOutput: _rawOutput, ...summary } = toolCall;
  return { ...summary, content: undefined };
}
