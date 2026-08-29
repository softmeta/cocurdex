import type { Editor } from "@tiptap/react";

// Append a Markdown clip to a TipTap editor that uses @tiptap/markdown.
//
// Do NOT use insertContentAt(..., { contentType: "markdown" }) for multi-block
// clips: markdown.parse() returns a full `{ type: "doc", content }` tree, and
// inserting that as a child of the live doc can no-op (or only work when
// replacing an empty textblock). setContent with a full markdown string is the
// same path as initial load and reliably round-trips blockquotes + links.

export function appendMarkdownToEditor(
  editor: Editor,
  markdown: string,
): boolean {
  if (editor.isDestroyed) {
    return false;
  }
  const clip = markdown.replace(/\r\n/g, "\n").trim();
  if (clip.length === 0) {
    return false;
  }

  const existing =
    typeof editor.getMarkdown === "function"
      ? editor.getMarkdown().replace(/\s+$/u, "")
      : "";
  const next = existing.length > 0 ? `${existing}\n\n${clip}` : clip;

  const ok = editor.commands.setContent(next, { contentType: "markdown" });
  if (!ok) {
    return false;
  }

  // setContent returns true even for some no-ops — require the clip text to be
  // present (quotes / links may normalize whitespace, so check a stable token).
  const fingerprint = clipFingerprint(clip);
  if (!fingerprint) {
    return true;
  }
  const after =
    typeof editor.getMarkdown === "function" ? editor.getMarkdown() : "";
  return after.includes(fingerprint);
}

// Prefer a non-markdown-syntax line from the clip so link URL encoding cannot
// make the check fail after parse/serialize.
function clipFingerprint(clip: string): string | null {
  for (const line of clip.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    // Skip pure link attribution lines.
    if (trimmed.startsWith("—") || trimmed.startsWith("-")) {
      continue;
    }
    // Skip markdown link-only lines.
    if (/^\[[^\]]+\]\([^)]+\)$/.test(trimmed)) {
      continue;
    }
    if (trimmed.length >= 2) {
      return trimmed;
    }
  }
  return clip.slice(0, 32) || null;
}
