export type MarkdownRendererTone = "assistant" | "user" | "system" | "editor";

export function getToneTextClass(tone: MarkdownRendererTone) {
  return tone === "assistant"
    ? "text-chat-fg"
    : tone === "system"
      ? "text-chat-system-fg"
      : tone === "editor"
        ? "text-editor-fg"
        : "text-chat-fg";
}

export function getToneMutedClass(tone: MarkdownRendererTone) {
  return tone === "assistant"
    ? "text-chat-fg-secondary"
    : tone === "system"
      ? "text-chat-system-fg"
      : tone === "editor"
        ? "text-editor-fg-muted"
        : "text-chat-fg";
}

export function getInlineCodeToneClass(tone: MarkdownRendererTone) {
  if (tone === "system") {
    return "border-chat-system-border bg-chat-system-bg text-chat-system-fg shadow-chat-inline-inset";
  }
  if (tone === "editor") {
    return "border-editor-border bg-editor-pane text-editor-fg";
  }
  if (tone === "user") {
    return "border-chat-border bg-chat-code-inline-user text-chat-fg shadow-chat-inline-inset";
  }
  return "border-chat-border bg-chat-code-inline text-chat-fg shadow-chat-inline-inset";
}

// Tone-aware text color for a confirmed-existing, clickable file-path chip. The
// link hue distinguishes it from plain inline code and stays constant; hover
// only adds the underline (applied by the chip itself).
export function getFilePathToneClass(tone: MarkdownRendererTone) {
  if (tone === "system") {
    return "text-chat-system-fg";
  }
  if (tone === "editor") {
    return "text-editor-fg";
  }
  return "text-chat-link";
}

export function getLeadingClass(tone: MarkdownRendererTone) {
  return tone === "assistant"
    ? "leading-[1.65]"
    : tone === "system"
      ? "leading-[1.65]"
      : tone === "editor"
        ? "leading-[1.65]"
        : "leading-[1.65]";
}
