// Minimal note Markdown + YAML frontmatter helpers (title/icon only).
// Kept dependency-free so pure unit tests can run in any package.

export interface NoteFrontmatter {
  title?: string;
  icon?: string | null;
}

export interface ParsedNoteMarkdown {
  frontmatter: NoteFrontmatter;
  body: string;
}

const FRONTMATTER_OPEN = /^---\r?\n/;

/**
 * Parse optional YAML frontmatter at the start of a note file.
 * Only `title` and `icon` keys are read; unknown keys are ignored.
 */
export function parseNoteMarkdown(raw: string): ParsedNoteMarkdown {
  if (!FRONTMATTER_OPEN.test(raw)) {
    return { frontmatter: {}, body: raw };
  }

  const afterOpen = raw.replace(FRONTMATTER_OPEN, "");
  const closeMatch = afterOpen.match(/\r?\n---\r?\n?/);
  if (!closeMatch || closeMatch.index === undefined) {
    return { frontmatter: {}, body: raw };
  }

  const fmBlock = afterOpen.slice(0, closeMatch.index);
  // Drop a single leading blank line after the closing `---` (common style).
  const body = afterOpen
    .slice(closeMatch.index + closeMatch[0].length)
    .replace(/^\r?\n/, "");
  return {
    frontmatter: parseFrontmatterBlock(fmBlock),
    body,
  };
}

/**
 * Serialize frontmatter + body. Omits empty frontmatter entirely.
 * Always ends with a trailing newline when body is non-empty or frontmatter
 * is present.
 */
export function serializeNoteMarkdown(
  frontmatter: NoteFrontmatter,
  body: string,
): string {
  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/\s+$/u, "");
  const lines: string[] = [];

  if (frontmatter.title !== undefined && frontmatter.title !== "") {
    lines.push(`title: ${formatYamlScalar(frontmatter.title)}`);
  }
  if (frontmatter.icon !== undefined && frontmatter.icon !== null) {
    lines.push(`icon: ${formatYamlScalar(frontmatter.icon)}`);
  }

  if (lines.length === 0) {
    return normalizedBody.length > 0 ? `${normalizedBody}\n` : "";
  }

  const fm = `---\n${lines.join("\n")}\n---\n`;
  if (normalizedBody.length === 0) {
    return `${fm}`;
  }
  return `${fm}\n${normalizedBody}\n`;
}

/**
 * Derive a filesystem-safe `.md` filename from a display title.
 * Keeps letters from any script (including CJK) and digits; other runs
 * become a single hyphen. Latin accents are stripped via NFKD.
 */
export function noteFilenameFromTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    // Letters (any script) + numbers; drop path / Windows-forbidden chars etc.
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return `${slug || "untitled"}.md`;
}

/** Derive a filesystem-safe directory name from a display title. */
export function noteFolderNameFromTitle(title: string): string {
  return noteFilenameFromTitle(title).replace(/\.md$/u, "");
}

/** Title fallback when frontmatter has no title: basename without `.md`. */
export function titleFromNoteId(id: string): string {
  const base = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return base.replace(/\.md$/iu, "") || "untitled";
}

/** Parent directory id for a note/folder rel path, or null at notes root. */
export function parentIdFromNoteId(id: string): string | null {
  const idx = id.lastIndexOf("/");
  return idx === -1 ? null : id.slice(0, idx);
}

function parseFrontmatterBlock(block: string): NoteFrontmatter {
  const result: NoteFrontmatter = {};
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      continue;
    }
    const key = trimmed.slice(0, colon).trim();
    const rawValue = trimmed.slice(colon + 1).trim();
    const value = unquoteYamlScalar(rawValue);
    if (key === "title") {
      result.title = value;
    } else if (key === "icon") {
      result.icon = value === "" || value === "null" ? null : value;
    }
  }
  return result;
}

function formatYamlScalar(value: string): string {
  if (value === "") {
    return '""';
  }
  // Quote when the value would be ambiguous or needs escaping.
  if (/[:#{}[\],&*!|>'"%@`]/u.test(value) || /^\s|\s$/u.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function unquoteYamlScalar(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const inner = value.slice(1, -1);
    return inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}
