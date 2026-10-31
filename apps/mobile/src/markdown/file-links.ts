import {
  type FilePathCandidate,
  parseFilePathCandidate,
  parseLocalFileHref,
  resolveCandidatePath,
} from "@cocurdex/shared";

export const FILE_LINK_SCHEME = "cocurdex-file:";

export interface FileLinkTarget {
  path: string;
  line: number | null;
}

const FENCE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const LINK_OR_CODE =
  /\[((?:[^\]\\]|\\.)*)\]\(\s*<?([^>\s)]+)>?(\s+"[^"]*")?\s*\)|`([^`\n]+)`/g;
const RESERVED_HREF = /^(?:#|[a-z][a-z0-9+.-]+:)/i;

function targetFor(
  candidate: FilePathCandidate | null,
  root: string | null,
): FileLinkTarget | null {
  if (!candidate) return null;
  const path = resolveCandidatePath(candidate.path, root);
  return path ? { path, line: candidate.startLine ?? null } : null;
}

function hrefTarget(href: string, root: string | null) {
  if (RESERVED_HREF.test(href) && !href.toLowerCase().startsWith("file:")) {
    return null;
  }
  return targetFor(parseLocalFileHref(href), root);
}

export function localFileLinkTarget(href: string, root: string | null) {
  return parseFileLinkHref(href) ?? hrefTarget(href, root);
}

export function fileLinkHref(target: FileLinkTarget) {
  const params = [`path=${encodeURIComponent(target.path)}`];
  if (target.line !== null) params.push(`line=${target.line}`);
  return `${FILE_LINK_SCHEME}?${params.join("&")}`;
}

export function parseFileLinkHref(href: string): FileLinkTarget | null {
  if (!href.startsWith(FILE_LINK_SCHEME)) return null;
  const query = href.slice(FILE_LINK_SCHEME.length).replace(/^\?/, "");
  const params = new Map(
    query.split("&").map((pair) => {
      const [key = "", value = ""] = pair.split("=");
      return [key, value] as const;
    }),
  );
  const rawPath = params.get("path");
  if (!rawPath) return null;
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  const line = Number(params.get("line"));
  return { path, line: Number.isInteger(line) && line > 0 ? line : null };
}

function mapProse(
  markdown: string,
  replace: (match: RegExpMatchArray) => string | null,
) {
  return markdown
    .split(FENCE)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      let result = "";
      let cursor = 0;
      for (const match of segment.matchAll(LINK_OR_CODE)) {
        const at = match.index ?? 0;
        result += segment.slice(cursor, at) + (replace(match) ?? match[0]);
        cursor = at + match[0].length;
      }
      return result + segment.slice(cursor);
    })
    .join("");
}

function matchTarget(match: RegExpMatchArray, root: string | null) {
  const [, , href, , code] = match;
  if (href !== undefined) return hrefTarget(href, root);
  return code === undefined
    ? null
    : targetFor(parseFilePathCandidate(code), root);
}

export function collectFileLinkTargets(
  markdown: string,
  root: string | null,
): FileLinkTarget[] {
  const targets = new Map<string, FileLinkTarget>();
  mapProse(markdown, (match) => {
    const target = matchTarget(match, root);
    if (target) targets.set(target.path, target);
    return null;
  });
  return [...targets.values()];
}

export function linkFilePaths(
  markdown: string,
  root: string | null,
  existing: ReadonlySet<string>,
) {
  if (existing.size === 0) return markdown;
  return mapProse(markdown, (match) => {
    const target = matchTarget(match, root);
    if (!target || !existing.has(target.path)) return null;
    const [whole, label, , title, code] = match;
    if (code !== undefined) return `[${whole}](${fileLinkHref(target)})`;
    return `[${label}](${fileLinkHref(target)}${title ?? ""})`;
  });
}

const CODE_PAD = "\u202f\u202f";
const LABEL_CODE = /^`([^`\n]+)`$/;

function paddedCode(code: string) {
  return `\`${CODE_PAD}${code}${CODE_PAD}\``;
}

export function padInlineCode(markdown: string) {
  return mapProse(markdown, (match) => {
    const [whole, label, href, , code] = match;
    if (code !== undefined) return paddedCode(code);
    const labelCode = label?.match(LABEL_CODE)?.[1];
    if (labelCode === undefined || href === undefined) return null;
    return `[${paddedCode(labelCode)}]${whole.slice(label.length + 2)}`;
  });
}
