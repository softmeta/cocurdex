import {
  type FilePathCandidate,
  parseFilePathCandidate,
  parseLocalFileHref,
  scanFilePathCandidates,
} from "@cocurdex/shared";
import type { ReactNode } from "react";

export interface ResolvedFilePath {
  absolutePath: string;
  startLine?: number;
  endLine?: number;
}

// Wiring supplied by the chat surface so the generic markdown renderer stays
// decoupled from the editor store and workspace state.
export interface MarkdownFilePathHandlers {
  // Resolve a parsed candidate to an absolute path (e.g. against the active
  // workspace root). Returns null when no workspace context is available.
  resolve(candidate: FilePathCandidate): ResolvedFilePath | null;
  // Cheap existence probe; the candidate only becomes clickable when true.
  checkExists(absolutePath: string): Promise<boolean>;
  // Open the resolved file in the editor panel, optionally revealing a line.
  open(target: ResolvedFilePath): void;
  // Localized tooltip label for the clickable affordance.
  openLabel?: string;
}

// Split a markdown link label into path-looking spans and plain prose so only
// the path becomes a clickable chip. Models often write
// [`headless.rs:846` 附近](real/path) or [`file.rs:10` 起](...) — the Chinese
// annotation must not ride along as part of the link.
export type WorkspaceLinkLabelPart =
  | { kind: "text"; text: string }
  | {
      kind: "path";
      text: string;
      startLine?: number;
      endLine?: number;
      column?: number;
    };

export function splitWorkspaceLinkLabel(
  label: string,
): WorkspaceLinkLabelPart[] {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const matches = scanFilePathCandidates(trimmed);
  if (matches.length === 0) {
    // No path token in the label — treat the whole label as the chip text
    // (open target still comes from the href candidate).
    return [{ kind: "path", text: trimmed }];
  }

  const parts: WorkspaceLinkLabelPart[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.index > cursor) {
      parts.push({
        kind: "text",
        text: trimmed.slice(cursor, match.index),
      });
    }
    parts.push({
      kind: "path",
      text: trimmed.slice(match.index, match.index + match.length),
      startLine: match.candidate.startLine,
      endLine: match.candidate.endLine,
      column: match.candidate.column,
    });
    cursor = match.index + match.length;
  }
  if (cursor < trimmed.length) {
    parts.push({ kind: "text", text: trimmed.slice(cursor) });
  }
  return parts;
}

// Extract a plain string from inline-code children. Inline code is almost always
// a single text node; bail out (null) for anything that mixes in elements so the
// caller falls back to default rendering.
export function extractInlineCodeText(children: ReactNode): string | null {
  if (typeof children === "string") {
    return children;
  }
  if (typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    const parts: string[] = [];
    for (const child of children) {
      if (typeof child === "string") {
        parts.push(child);
      } else if (typeof child === "number") {
        parts.push(String(child));
      } else {
        return null;
      }
    }
    return parts.join("");
  }
  return null;
}

// Private https host used to smuggle workspace-relative file links past
// Streamdown's rehype-harden layer. Bare relative hrefs like
// `crates/foo/bar.md` fail harden's URL parse (it only accepts `/`, `./`,
// `../` as relative, and always blocks `file:`), so they render as
// `label [blocked]`. We rewrite those links to this origin before render,
// then the markdown `a` component resolves them through filePathHandlers
// and opens the editor — never the system browser.
export const WORKSPACE_FILE_LINK_HOST = "cocurdex.workspace";
const WORKSPACE_FILE_LINK_ORIGIN = `https://${WORKSPACE_FILE_LINK_HOST}`;

export function buildWorkspaceFileHref(candidate: FilePathCandidate): string {
  const params = new URLSearchParams();
  params.set("path", candidate.path);
  if (candidate.startLine !== undefined) {
    params.set("line", String(candidate.startLine));
  }
  if (candidate.endLine !== undefined) {
    params.set("end", String(candidate.endLine));
  }
  if (candidate.column !== undefined) {
    params.set("column", String(candidate.column));
  }
  return `${WORKSPACE_FILE_LINK_ORIGIN}/open?${params.toString()}`;
}

export function parseWorkspaceFileHref(
  href: string | undefined,
): FilePathCandidate | null {
  if (!href) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== WORKSPACE_FILE_LINK_HOST) {
    return null;
  }

  const path = url.searchParams.get("path");
  if (!path) {
    return null;
  }

  const candidate: FilePathCandidate = { path };
  const lineRaw = url.searchParams.get("line");
  if (lineRaw) {
    const startLine = Number(lineRaw);
    if (Number.isInteger(startLine) && startLine > 0) {
      candidate.startLine = startLine;
    }
  }
  const endRaw = url.searchParams.get("end");
  if (endRaw) {
    const endLine = Number(endRaw);
    if (
      Number.isInteger(endLine) &&
      endLine > 0 &&
      (candidate.startLine === undefined || endLine >= candidate.startLine)
    ) {
      candidate.endLine = endLine;
    }
  }
  const columnRaw = url.searchParams.get("column");
  if (columnRaw) {
    const column = Number(columnRaw);
    if (Number.isInteger(column) && column > 0) {
      candidate.column = column;
    }
  }
  return candidate;
}

// Hrefs that already go through the normal external / anchor path — leave them
// alone so we never rewrite real web links or in-document hashes.
function isReservedMarkdownHref(href: string): boolean {
  return (
    href.startsWith("#") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("irc:") ||
    href.startsWith("ircs:") ||
    href.startsWith("xmpp:") ||
    href.startsWith("blob:") ||
    href.startsWith("cocurdex-")
  );
}

// Match `[label](href)` / `[label](<href>)` / `[label](href "title")`.
// Labels often wrap the path in backticks: [`path`](path). Captures keep the
// original label (including backticks) so we only rewrite the href.
const MARKDOWN_LINK =
  /\[([^\]]*)]\(\s*(<?)([^>\s)]+)(>?)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;

function rewriteLinksInProse(segment: string): string {
  return segment.replace(
    MARKDOWN_LINK,
    (
      match,
      label: string,
      _openAngle: string,
      href: string,
      _closeAngle: string,
      title: string | undefined,
    ) => {
      if (isReservedMarkdownHref(href)) {
        return match;
      }

      const candidate = parseLocalFileHref(href);
      if (!candidate) {
        return match;
      }

      const nextHref = buildWorkspaceFileHref(candidate);
      // Drop angle brackets: the rewritten https URL never needs them, and
      // leaving `<>` around a long query string confuses some parsers.
      return `[${label}](${nextHref}${title ?? ""})`;
    },
  );
}

// Rewrite assistant markdown so workspace-relative file links survive
// rehype-harden and can open in the editor. Only call when filePathHandlers
// are wired — otherwise the rewritten https://cocurdex.workspace/... URLs
// would be dead ends.
export function rewriteMarkdownLocalFileLinks(content: string): string {
  if (!content.includes("](")) {
    return content;
  }

  // Leave fenced code blocks untouched (sample markdown inside ```...```).
  const segments = content.split(/(```[\s\S]*?```)/g);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        return segment;
      }
      return rewriteLinksOutsideInlineCode(segment);
    })
    .join("");
}

// Placeholder that cannot appear in a real markdown file href, used while
// temporarily hiding inline-code spans from the link regex.
const INLINE_CODE_MASK = /%%COCURDEX_INLINE_(\d+)%%/g;

const INLINE_CODE_SPAN = /`([^`\n]*)`/g;
const MARKDOWN_LINK_ONLY = new RegExp(`^${MARKDOWN_LINK.source}$`);

function unwrapPathLabeledFileLinkCodeSpan(span: string): string | null {
  const inner = span.slice(1, -1);
  const match = inner.match(MARKDOWN_LINK_ONLY);
  if (!match) {
    return null;
  }

  const href = match[3];
  if (isReservedMarkdownHref(href) || !parseFilePathCandidate(match[1])) {
    return null;
  }

  return parseLocalFileHref(href) ? inner : null;
}

// Mask whole inline-code spans, rewrite links on the remainder, then restore.
//
// - [`path`](path) → mask turns the label into a token so the outer link still
//   matches and only the href is rewritten (GitHub-style file citations).
// - `[local](src/a.ts)` entirely inside one code span → fully masked, left alone.
function rewriteLinksOutsideInlineCode(segment: string): string {
  if (!segment.includes("](")) {
    return segment;
  }

  const masks: string[] = [];
  const masked = segment.replace(INLINE_CODE_SPAN, (span) => {
    const unwrapped = unwrapPathLabeledFileLinkCodeSpan(span);
    if (unwrapped !== null) {
      return unwrapped;
    }
    const token = `%%COCURDEX_INLINE_${masks.length}%%`;
    masks.push(span);
    return token;
  });

  const rewritten = rewriteLinksInProse(masked);
  return rewritten.replace(INLINE_CODE_MASK, (_m, idx: string) => {
    return masks[Number(idx)] ?? "";
  });
}
