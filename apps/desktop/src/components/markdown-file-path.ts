import {
  type FilePathCandidate,
  parseFilePathCandidate,
  parseLocalFileHref,
  scanFilePathCandidates,
} from "@cocurdex/client-runtime";
import type { ReactNode } from "react";

export interface ResolvedFilePath {
  absolutePath: string;
  startLine?: number;
  endLine?: number;
}

export interface MarkdownFilePathHandlers {
  resolve(candidate: FilePathCandidate): ResolvedFilePath | null;
  checkExists(absolutePath: string): Promise<boolean>;
  open(target: ResolvedFilePath): void;
  openLabel?: string;
}

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
      return `[${label}](${nextHref}${title ?? ""})`;
    },
  );
}

export function rewriteMarkdownLocalFileLinks(content: string): string {
  if (!content.includes("](")) {
    return content;
  }

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
