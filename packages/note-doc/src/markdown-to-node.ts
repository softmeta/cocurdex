import type { JSONContent } from "@tiptap/core";
import type { Node, Schema } from "@tiptap/pm/model";
import {
  lexNoteMarkdownBlocks,
  parseNoteMarkdown,
  serializeNoteMarkdown,
} from "./markdown";

function wordCharacterCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [character] of text.matchAll(/[\p{L}\p{N}]/gu)) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  return counts;
}

function keepsEveryWordCharacter(source: string, converted: string): boolean {
  const after = wordCharacterCounts(converted);
  for (const [character, count] of wordCharacterCounts(source)) {
    if ((after.get(character) ?? 0) < count) {
      return false;
    }
  }
  return true;
}

function wrapStrayInlineNodes(schema: Schema, json: JSONContent): JSONContent {
  const children = json.content?.map((child) =>
    wrapStrayInlineNodes(schema, child),
  );
  const nodeType = json.type ? schema.nodes[json.type] : undefined;
  if (!children || !nodeType || nodeType.inlineContent) {
    return children ? { ...json, content: children } : json;
  }
  const content: JSONContent[] = [];
  let inlineRun: JSONContent[] | null = null;
  for (const child of children) {
    if (!(child.type && schema.nodes[child.type]?.isInline)) {
      inlineRun = null;
      content.push(child);
      continue;
    }
    if (!inlineRun) {
      inlineRun = [];
      content.push({ type: "paragraph", content: inlineRun });
    }
    inlineRun.push(child);
  }
  return { ...json, content };
}

function convertLosslessly(
  schema: Schema,
  markdown: string,
  json: JSONContent,
): Node | null {
  try {
    const node = schema.nodeFromJSON(wrapStrayInlineNodes(schema, json));
    node.check();
    return keepsEveryWordCharacter(
      markdown,
      serializeNoteMarkdown(node.toJSON()),
    )
      ? node
      : null;
  } catch {
    return null;
  }
}

function plainTextParagraph(raw: string): JSONContent {
  const lines = raw.replace(/\r\n?/gu, "\n").trim().split("\n");
  return {
    type: "paragraph",
    content: lines.flatMap((line, index) => [
      ...(index > 0 ? [{ type: "hardBreak" }] : []),
      ...(line ? [{ type: "text", text: line }] : []),
    ]),
  };
}

function convertBlock(schema: Schema, rawBlock: string): JSONContent[] {
  const raw = rawBlock.trimEnd();
  if (!raw) {
    return [];
  }
  const json = parseNoteMarkdown(raw);
  const node = convertLosslessly(schema, raw, json);
  return node ? (node.toJSON().content ?? []) : [plainTextParagraph(raw)];
}

export function noteMarkdownToNode(schema: Schema, markdown: string): Node {
  const whole = convertLosslessly(
    schema,
    markdown,
    parseNoteMarkdown(markdown),
  );
  if (whole) {
    return whole;
  }
  const content = lexNoteMarkdownBlocks(markdown).flatMap((raw) =>
    convertBlock(schema, raw),
  );
  return schema.nodeFromJSON({ type: "doc", content });
}
