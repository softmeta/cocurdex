import type { Editor } from "@tiptap/react";

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

  const fingerprint = clipFingerprint(clip);
  if (!fingerprint) {
    return true;
  }
  const after =
    typeof editor.getMarkdown === "function" ? editor.getMarkdown() : "";
  return after.includes(fingerprint);
}

function clipFingerprint(clip: string): string | null {
  for (const line of clip.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (trimmed.startsWith("—") || trimmed.startsWith("-")) {
      continue;
    }
    if (/^\[[^\]]+\]\([^)]+\)$/.test(trimmed)) {
      continue;
    }
    if (trimmed.length >= 2) {
      return trimmed;
    }
  }
  return clip.slice(0, 32) || null;
}
