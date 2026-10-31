const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

export function isAbsoluteFilePath(path: string) {
  return path.startsWith("/") || WINDOWS_ABSOLUTE_PATH.test(path);
}

function trailingRunLength(text: string, chars: string) {
  let end = text.length;
  while (end > 0 && chars.includes(text[end - 1] ?? "")) end -= 1;
  return text.length - end;
}

export function resolveCandidatePath(path: string, rootPath: string | null) {
  if (isAbsoluteFilePath(path)) return path;
  if (!rootPath) return null;
  const separator = WINDOWS_ABSOLUTE_PATH.test(rootPath) ? "\\" : "/";
  const base = rootPath.slice(
    0,
    rootPath.length - trailingRunLength(rootPath, "\\/"),
  );
  return `${base}${separator}${path.replace(/^\.\//, "")}`;
}

export interface FilePathCandidate {
  path: string;
  startLine?: number;
  endLine?: number;
  column?: number;
}

const KNOWN_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "jsonc",
  "go",
  "rs",
  "py",
  "rb",
  "java",
  "kt",
  "kts",
  "c",
  "h",
  "cpp",
  "cc",
  "hpp",
  "cs",
  "swift",
  "php",
  "sh",
  "bash",
  "zsh",
  "fish",
  "md",
  "mdx",
  "txt",
  "yml",
  "yaml",
  "toml",
  "xml",
  "html",
  "css",
  "scss",
  "sass",
  "less",
  "sql",
  "vue",
  "svelte",
  "gradle",
  "proto",
  "graphql",
  "lock",
  "cfg",
  "ini",
  "conf",
]);

const PATH_CHARS = /^[\w.\-/@~]+$/;
const LOCATION_SUFFIX = /^(.*?):(\d+)(?:[-–](\d+))?(?::(\d+))?$/;

function looksLikePath(path: string): boolean {
  if (path.length < 2 || !PATH_CHARS.test(path)) {
    return false;
  }

  if (path.includes("/")) {
    return true;
  }

  const lastDot = path.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === path.length - 1) {
    return false;
  }

  return KNOWN_EXTENSIONS.has(path.slice(lastDot + 1).toLowerCase());
}

function parseLocationSuffix(raw: string): FilePathCandidate | null {
  const match = raw.match(LOCATION_SUFFIX);
  if (!match || match[1].length === 0) {
    return null;
  }

  const path = match[1];
  if (!looksLikePath(path)) {
    return null;
  }

  const startLine = Number(match[2]);
  const candidate: FilePathCandidate = { path, startLine };
  const endLine = match[3] === undefined ? undefined : Number(match[3]);
  if (endLine !== undefined && endLine > startLine) {
    candidate.endLine = endLine;
  }
  if (match[4] !== undefined) {
    candidate.column = Number(match[4]);
  }
  return candidate;
}

export function parseFilePathCandidate(raw: string): FilePathCandidate | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const location = parseLocationSuffix(trimmed);
  if (location) {
    return location;
  }

  return looksLikePath(trimmed) ? { path: trimmed } : null;
}

export interface FilePathMatch {
  index: number;
  length: number;
  candidate: FilePathCandidate;
}

const PATH_TOKEN = /[\w./\\@~:#-]+/g;
const LEADING_NOISE = /^[#:]+/;

export function scanFilePathCandidates(text: string): FilePathMatch[] {
  const matches: FilePathMatch[] = [];
  for (const match of text.matchAll(PATH_TOKEN)) {
    const raw = match[0];
    const leadTrim = raw.match(LEADING_NOISE)?.[0].length ?? 0;
    const afterLead = raw.slice(leadTrim);
    const trailTrim = trailingRunLength(afterLead, ".,:;#");
    const token = afterLead.slice(0, afterLead.length - trailTrim);
    if (token.length < 2) {
      continue;
    }
    const candidate = parseFilePathCandidate(token);
    if (candidate) {
      matches.push({
        index: (match.index ?? 0) + leadTrim,
        length: token.length,
        candidate,
      });
    }
  }
  return matches;
}

function decodeHrefCandidate(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

const FILE_URL_PREFIX = "file:";
const LEADING_DRIVE_SLASH = /^\/[A-Za-z]:\//;

function isLocalFileHost(hostname: string): boolean {
  return hostname === "" || hostname === "localhost";
}

function isAbsoluteFileTarget(path: string): boolean {
  if (!isAbsoluteFilePath(path)) {
    return false;
  }
  return path.slice(path.lastIndexOf("/") + 1).length > 0;
}

function parseFileUrlCandidate(href: string): FilePathCandidate | null {
  if (!href.toLowerCase().startsWith(FILE_URL_PREFIX)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "file:" || !isLocalFileHost(url.hostname)) {
    return null;
  }

  let rawPath: string;
  try {
    rawPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (LEADING_DRIVE_SLASH.test(rawPath)) {
    rawPath = rawPath.slice(1);
  }

  const location = parseLocationSuffix(rawPath);
  const path = location?.path ?? rawPath;
  if (!isAbsoluteFileTarget(path)) {
    return null;
  }

  return location ? { ...location, path } : { path };
}

const LINE_ANCHOR = /^(.+)#L(\d+)(?:C\d+)?(?:-L?(\d+)(?:C\d+)?)?$/;

export function parseLocalFileHref(href: string): FilePathCandidate | null {
  const anchor = href.match(LINE_ANCHOR);
  const target = anchor ? anchor[1] : href;
  const candidate =
    parseFileUrlCandidate(target) ??
    parseFilePathCandidate(decodeHrefCandidate(target));
  if (!candidate || !anchor || candidate.startLine !== undefined) {
    return candidate;
  }

  const startLine = Number(anchor[2]);
  const endLine = anchor[3] === undefined ? undefined : Number(anchor[3]);
  if (endLine !== undefined && endLine > startLine) {
    return { ...candidate, startLine, endLine };
  }
  return { ...candidate, startLine };
}
